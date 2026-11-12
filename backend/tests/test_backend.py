"""Offline regression checks: no .env, live model, or database access."""
import importlib
import json
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
import ai


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
        for method in ["select", "eq", "order", "limit", "insert", "update"]:
            getattr(self.query, method).return_value = self.query
        self.db_patch = patch.object(main, "get_supabase_clients", return_value=(MagicMock(), self.db))
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        generation_patch = patch.object(main, "generate_recommendations", new=AsyncMock(return_value=[{
            "title": "Saran AI", "description": "Saran edukasi yang dibuat oleh model.",
            "generator": "qwen-rag-v1", "source_url": ai.HEALTH_SOURCES["CDC_PREVENT"][2],
        }]))
        generation_patch.start()
        self.addCleanup(generation_patch.stop)
        self.addCleanup(main.app.dependency_overrides.clear)

    def login(self):
        main.app.dependency_overrides[main.get_authenticated_user] = lambda: "test-owner"

    def test_protected_routes_require_login(self):
        for method, path, kwargs in [
            ("GET", "/api/history", {}),
            ("GET", "/api/history/test-id", {}),
            ("POST", "/api/predict", {"json": ANSWERS}),
            ("POST", "/api/history/test-id/recommendations", {}),
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

    def test_prediction_returns_binary_result_and_stores_owner(self):
        self.login()
        self.query.execute.return_value = SimpleNamespace(data=[{
            "id": "new-record", "created_at": "2026-11-12T00:00:00Z",
        }])
        with patch.object(main, "predict_via_llama", new=AsyncMock(return_value=1)):
            response = self.client.post("/api/predict", json=ANSWERS)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["prediction"]["predicted_label"], 1)
        self.assertNotIn("experimental_score_percent", result["prediction"])
        self.assertEqual(result["prediction"]["meaning"], "Terindikasi diabetes")
        saved = self.query.insert.call_args.args[0]
        self.assertEqual(saved["user_id"], "test-owner")
        self.assertEqual(saved["questionnaire_answers"], ANSWERS)
        self.assertNotIn("experimental_score_percent", saved)

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

    def test_recommendation_failure_preserves_classification(self):
        self.login()
        self.query.execute.return_value = SimpleNamespace(data=[{"id": "saved", "created_at": "now"}])
        with patch.object(main, "predict_via_llama", new=AsyncMock(return_value=1)), \
             patch.object(main, "generate_recommendations", new=AsyncMock(side_effect=ai.AIUnavailable("Try again"))):
            response = self.client.post("/api/predict", json=ANSWERS)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["prediction"]["predicted_label"], 1)
        self.assertEqual(response.json()["recommendation_status"], "unavailable")
        self.assertEqual(self.query.insert.call_args.args[0]["recommendations"], [])


    def test_regeneration_is_scoped_to_owner(self):
        self.login()
        record = {"id": "owned", "predicted_label": 1, "questionnaire_answers": ANSWERS,
                  "recommendations": []}
        self.query.execute.return_value = SimpleNamespace(data=[record])
        response = self.client.post("/api/history/owned/recommendations")
        self.assertEqual(response.status_code, 200)
        self.query.eq.assert_any_call("user_id", "test-owner")
        self.query.eq.assert_any_call("id", "owned")
        saved = self.query.update.call_args.args[0]["recommendations"]
        self.assertEqual(saved[0]["generator"], "qwen-rag-v1")

    def test_regeneration_cannot_update_unowned_screening(self):
        self.login()
        self.query.execute.return_value = SimpleNamespace(data=[])
        response = self.client.post("/api/history/other/recommendations")
        self.assertEqual(response.status_code, 404)
        self.query.update.assert_not_called()


class RecommendationTests(unittest.IsolatedAsyncioTestCase):
    def tips(self):
        return {"recommendations": [{"title": "Tinjau kebiasaan merokok",
                 "description": "Bila masih merokok, diskusikan dukungan berhenti; bila sudah berhenti, pertahankan kebiasaan tersebut.",
                 "reason_keys": ["Smoker"], "source_id": "CDC_SMOKING"}]}

    async def generate(self, body, *, status=200):
        references = [{"source_id": key, "url": value[2], "text": "A synthetic reference passage for this test, not real clinical evidence."}
                      for key, value in ai.HEALTH_SOURCES.items()]
        original_client = httpx.AsyncClient

        def respond(request):
            payload = json.loads(request.content)
            answers = json.loads(payload["messages"][1]["content"])["answers"]
            self.assertEqual(set(answers), set(ANSWERS) | {"BMI"})
            self.assertEqual(payload["lora"], [])
            return httpx.Response(status, json={"choices": [{"message": {"content": json.dumps(body)}}]})

        with patch.object(ai, "load_knowledge", return_value=references), \
             patch.object(ai.httpx, "AsyncClient", side_effect=lambda **kwargs: original_client(transport=httpx.MockTransport(respond))):
            return await ai.generate_recommendations(ScreeningForm.model_validate(ANSWERS), 27.7, 1, "http://model.test")

    async def test_generated_advice_uses_backend_sources_and_real_answers(self):
        tips = await self.generate(self.tips())
        self.assertEqual(tips[0]["generator"], "qwen-rag-v1")
        self.assertEqual(tips[0]["source_url"], ai.HEALTH_SOURCES["CDC_SMOKING"][2])
        self.assertIn("Pernah merokok minimal 100 batang: Ya", tips[0]["reason_from_questionnaire"])
        self.assertIn("status saat ini belum ditanyakan", tips[0]["reason_from_questionnaire"])

    async def test_invented_reference_and_missing_smoking_advice_are_rejected(self):
        for source in ("INVENTED", "CDC_PREVENT"):
            body = self.tips()
            body["recommendations"][0]["source_id"] = source
            with self.subTest(source=source), self.assertRaises(ai.AIUnavailable):
                await self.generate(body)

    async def test_invented_answer_and_generated_percent_are_rejected(self):
        for change in ({"reason_keys": ["Smoker", "invented_answer"]}, {"description": "Anda memiliki risiko diabetes sebesar 80%."}):
            body = self.tips()
            body["recommendations"][0].update(change)
            with self.subTest(change=change), self.assertRaises(ai.AIUnavailable):
                await self.generate(body)

    async def test_generation_http_error_is_actionable(self):
        with self.assertRaises(ai.AIUnavailable):
            await self.generate(self.tips(), status=500)


if __name__ == "__main__":
    unittest.main()
