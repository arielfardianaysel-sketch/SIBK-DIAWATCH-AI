"""Offline regression checks: no .env, live model, or database access."""
import importlib
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

# main normally loads .env at import time. Deliberately suppress it here.
with patch("dotenv.load_dotenv"), patch.dict(os.environ, {}, clear=True):
    main = importlib.import_module("main")

from questionnaire import FEATURES, ScreeningForm, age_to_bucket, features_from_form


ANSWERS = {
    "age_years": 45, "sex_uci": 1, "height_cm": 170, "weight_kg": 80,
    "HighBP": 1, "HighChol": 0, "CholCheck": 1, "Stroke": 0,
    "HeartDiseaseorAttack": 0, "Smoker": 1, "PhysActivity": 0,
    "Fruits": 0, "Veggies": 1, "HvyAlcoholConsump": 0,
    "GenHlth": 3, "MentHlth": 2, "PhysHlth": 1, "DiffWalk": 0,
    "sugary_days_per_week": 5, "family_history": 1,
}


class QuestionnaireTests(unittest.TestCase):
    def test_age_bucket_boundaries(self):
        for age, expected in [(18, 1), (24, 1), (25, 2), (29, 2),
                              (30, 3), (79, 12), (80, 13), (100, 13)]:
            with self.subTest(age=age):
                self.assertEqual(age_to_bucket(age), expected)

    def test_features_preserve_training_contract(self):
        features, bmi = features_from_form(ScreeningForm.model_validate(ANSWERS))
        self.assertEqual(set(features), set(FEATURES))
        self.assertEqual(len(features), 17)
        self.assertEqual(features["Age"], 6)
        self.assertEqual(features["Sex"], 1)
        self.assertEqual(features["BMI"], 28)
        self.assertEqual(features["Smoker"], 1)
        self.assertEqual(bmi, 27.7)
        self.assertNotIn("family_history", features)
        self.assertNotIn("sugary_days_per_week", features)

    def test_reject_invalid_and_extra_answers(self):
        for update in [{"age_years": 17}, {"Smoker": 2}, {"MentHlth": 31},
                       {"height_cm": 0}, {"user_id": "another-user"},
                       {"sugary_days_per_week": 8}]:
            with self.subTest(update=update), self.assertRaises(ValidationError):
                ScreeningForm.model_validate(ANSWERS | update)


class InferenceTests(unittest.IsolatedAsyncioTestCase):
    async def call_model(self, response):
        client = AsyncMock()
        client.post.return_value = response
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=client)
        context.__aexit__ = AsyncMock(return_value=False)
        with patch.object(main.httpx, "AsyncClient", return_value=context):
            return await main.predict_via_llama({key: 1 for key in FEATURES})

    async def test_accepts_binary_label(self):
        for label in ["0", "1", " 1\n"]:
            response = httpx.Response(200, json={"choices": [{"message": {"content": label}}]},
                                      request=httpx.Request("POST", "http://model.test"))
            self.assertEqual(await self.call_model(response), int(label))

    async def test_rejects_generative_output(self):
        for output in ["Risiko 80%", "1 karena BMI tinggi", "2", ""]:
            response = httpx.Response(200, json={"choices": [{"message": {"content": output}}]},
                                      request=httpx.Request("POST", "http://model.test"))
            with self.subTest(output=output), self.assertRaises(HTTPException) as caught:
                await self.call_model(response)
            self.assertEqual(caught.exception.status_code, 502)

    async def test_model_error_is_service_unavailable(self):
        response = httpx.Response(500, request=httpx.Request("POST", "http://model.test"))
        with self.assertRaises(HTTPException) as caught:
            await self.call_model(response)
        self.assertEqual(caught.exception.status_code, 503)


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.db = MagicMock()
        self.query = self.db.table.return_value
        for method in ["select", "eq", "order", "limit", "insert"]:
            getattr(self.query, method).return_value = self.query
        self.db_patch = patch.object(main, "get_supabase_clients", return_value=(MagicMock(), self.db))
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.addCleanup(main.app.dependency_overrides.clear)

    def login(self):
        main.app.dependency_overrides[main.get_authenticated_user] = lambda: "test-owner"

    def test_protected_routes_require_login(self):
        for method, path, kwargs in [
            ("GET", "/api/history", {}),
            ("GET", "/api/history/test-id", {}),
            ("POST", "/api/predict", {"json": ANSWERS}),
        ]:
            response = self.client.request(method, path, **kwargs)
            self.assertEqual(response.status_code, 401)
        self.db.table.assert_not_called()

    def test_history_is_filtered_by_authenticated_owner(self):
        self.login()
        self.query.execute.return_value = SimpleNamespace(data=[{"id": "owned"}])
        response = self.client.get("/api/history")
        self.assertEqual(response.json(), {"items": [{"id": "owned"}]})
        self.query.eq.assert_called_with("user_id", "test-owner")

    def test_unowned_or_missing_detail_is_not_found(self):
        self.login()
        self.query.execute.return_value = SimpleNamespace(data=[])
        response = self.client.get("/api/history/other-record")
        self.assertEqual(response.status_code, 404)
        self.query.eq.assert_any_call("user_id", "test-owner")
        self.query.eq.assert_any_call("id", "other-record")

    def test_prediction_preserves_null_score_and_stores_owner(self):
        self.login()
        self.query.execute.return_value = SimpleNamespace(data=[{
            "id": "new-record", "created_at": "2026-11-12T00:00:00Z",
        }])
        with patch.object(main, "predict_via_llama", new=AsyncMock(return_value=1)):
            response = self.client.post("/api/predict", json=ANSWERS)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["prediction"]["predicted_label"], 1)
        self.assertIsNone(result["prediction"]["experimental_score_percent"])
        self.assertFalse(result["prediction"]["score_is_clinical_risk"])
        saved = self.query.insert.call_args.args[0]
        self.assertEqual(saved["user_id"], "test-owner")
        self.assertEqual(saved["questionnaire_answers"], ANSWERS)
        self.assertIsNone(saved["experimental_score_percent"])

    def test_model_failure_does_not_write_database(self):
        self.login()
        with patch.object(main, "predict_via_llama", new=AsyncMock(
            side_effect=HTTPException(status_code=503, detail="Model unavailable")
        )):
            response = self.client.post("/api/predict", json=ANSWERS)
        self.assertEqual(response.status_code, 503)
        self.db.table.assert_not_called()

    def test_database_failure_is_reported(self):
        self.login()
        self.query.execute.side_effect = RuntimeError("simulated database failure")
        with patch.object(main, "predict_via_llama", new=AsyncMock(return_value=0)):
            response = self.client.post("/api/predict", json=ANSWERS)
        self.assertEqual(response.status_code, 502)


if __name__ == "__main__":
    unittest.main()
