"""Exercise the evaluation pipeline with synthetic data and an in-process LLM mock."""
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "diawatch-matplotlib"))

import httpx
import matplotlib
matplotlib.use("Agg")
import pandas as pd

import evaluate_model as evaluation
import evaluation_fallback as fallback
from questionnaire import FEATURES


class PredictionTests(unittest.TestCase):
    def test_model_response_validation(self):
        for output, expected in [("0", 0), (" 1\n", 1), ("risiko 80%", None),
                                 ("", None), (None, None), (1, None)]:
            with self.subTest(output=output):
                def respond(request):
                    return httpx.Response(200, json={"choices": [{"message": {"content": output}}]})
                with httpx.Client(transport=httpx.MockTransport(respond)) as client:
                    result, _ = evaluation.predict_qwen(client, pd.Series({key: 1 for key in FEATURES}))
                self.assertEqual(result, expected)

    def test_http_failure_is_not_a_negative_label(self):
        with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(503))) as client:
            with self.assertRaises(httpx.HTTPStatusError):
                evaluation.predict_qwen(client, pd.Series({key: 1 for key in FEATURES}))


class FallbackTests(unittest.TestCase):
    def test_metrics_and_zero_division(self):
        truth, predicted = [0, 1, 1, 0], [0, 1, 0, 1]
        self.assertEqual(fallback.accuracy_score(truth, predicted), 0.5)
        self.assertEqual(fallback.precision_score(truth, predicted), 0.5)
        self.assertEqual(fallback.recall_score(truth, predicted), 0.5)
        self.assertEqual(fallback.f1_score(truth, predicted), 0.5)
        self.assertEqual(fallback.precision_score([1], [0], zero_division=0), 0.0)

    def test_split_is_repeatable_and_disjoint(self):
        data = pd.DataFrame({"target": [0, 1] * 50})
        train, test = fallback.train_test_split(data, test_size=30, stratify=pd.Series(data["target"]))
        _, repeated = fallback.train_test_split(data, test_size=30, stratify=pd.Series(data["target"]))
        self.assertEqual(len(train), 70)
        self.assertEqual(len(test), 30)
        self.assertFalse(set(train.index) & set(test.index))
        self.assertEqual(set(train.index) | set(test.index), set(data.index))
        self.assertEqual(list(test.index), list(repeated.index))
        self.assertEqual(test["target"].value_counts().to_dict(), {0: 15, 1: 15})

    def test_import_uses_fallback_when_sklearn_cannot_load(self):
        original_import = __import__

        def without_sklearn(name, *args, **kwargs):
            if name == "sklearn" or name.startswith("sklearn."):
                raise ImportError("simulated blocked compiled library")
            return original_import(name, *args, **kwargs)

        spec = importlib.util.spec_from_file_location("evaluation_without_sklearn", BACKEND_DIR / "evaluate_model.py")
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        with patch("builtins.__import__", side_effect=without_sklearn):
            spec.loader.exec_module(module)
        self.assertFalse(module.USING_SKLEARN)
        self.assertEqual(module.accuracy_score([0, 1], [0, 1]), 1.0)


class EvaluationPipelineTests(unittest.TestCase):
    def run_pipeline(self, output):
        # Large enough for both existing stratified sampling steps; no UCI download.
        features = pd.DataFrame({key: [1] * 4000 for key in FEATURES})
        targets = pd.DataFrame({"Diabetes_binary": [0, 1] * 2000})
        dataset = SimpleNamespace(data=SimpleNamespace(features=features, targets=targets))

        def respond(request):
            return httpx.Response(200, json={"choices": [{"message": {"content": output}}]})

        with tempfile.TemporaryDirectory(prefix="diawatch-eval-test-") as temp_dir:
            directory = Path(temp_dir)
            client = httpx.Client(transport=httpx.MockTransport(respond))
            self.addCleanup(client.close)
            with patch.object(evaluation, "fetch_ucirepo", return_value=dataset), \
                 patch.object(evaluation.httpx, "Client", return_value=client), \
                 patch.object(evaluation, "BACKEND_DIR", directory), \
                 patch.object(evaluation, "EVAL_SIZE", 3), \
                 redirect_stdout(io.StringIO()) as console:
                evaluation.main()
            result = pd.read_csv(directory / "diawatch_evaluasi_lokal.csv")
            png_exists = (directory / "diawatch_confusion_matrix.png").exists()
            return result, png_exists, console.getvalue()

    def test_valid_predictions_produce_csv_and_chart(self):
        result, png_exists, _ = self.run_pipeline("0")
        self.assertEqual(len(result), 3)
        self.assertEqual(result["prediksi_qwen"].tolist(), [0, 0, 0])
        self.assertTrue(png_exists)

    def test_invalid_predictions_remain_failures_without_chart(self):
        result, png_exists, console = self.run_pipeline("bukan label")
        self.assertEqual(len(result), 3)
        self.assertTrue(result["prediksi_qwen"].isna().all())
        self.assertFalse(png_exists)
        self.assertIn("confusion matrix tidak dibuat", console)


if __name__ == "__main__":
    unittest.main()
