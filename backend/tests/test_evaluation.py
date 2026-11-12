"""Exercise the evaluation pipeline with synthetic data and an in-process LLM mock."""
import importlib.util
import io
import json
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
import ai
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


class CalibrationTests(unittest.TestCase):
    def write_split(self, directory, prefix):
        frame = pd.DataFrame({key: [1] * 60 for key in FEATURES})
        frame["target"] = [0, 1] * 30
        frame["BMI"] = 20 + 2 * frame["target"]
        frame["row_id"] = [f"{prefix}-{i}" for i in range(60)]
        path = directory / f"{prefix}.csv"
        frame.to_csv(path, index=False)
        return path

    def test_calibration_export_and_runtime_loading_use_same_signature(self):
        if not evaluation.USING_SKLEARN:
            self.skipTest("Full calibration requires working sklearn")

        def respond(request):
            body = json.loads(request.content)
            label = "1" if "BMI: 22\n" in body["messages"][1]["content"] else "0"
            logs = [{"token": digit, "logprob": -0.2 if digit == label else -2.2} for digit in ("0", "1")]
            return httpx.Response(200, json={"choices": [{"message": {"content": label},
                "logprobs": {"content": [{"token": label, "top_logprobs": logs}]}}]})

        with tempfile.TemporaryDirectory(prefix="diawatch-calibration-test-") as temp_dir:
            directory = Path(temp_dir)
            train, calibration, test = [self.write_split(directory, name) for name in ("train", "calibration", "test")]
            output = directory / "calibration.json"
            client = httpx.Client(transport=httpx.MockTransport(respond))
            self.addCleanup(client.close)
            with patch.object(evaluation.httpx, "Client", return_value=client), redirect_stdout(io.StringIO()):
                evaluation.calibrate(train, calibration, test, "synthetic-test-only", 0.2, 0.8,
                                     "Synthetic fixture thresholds, not medical cutoffs", output=output)
            with patch.object(ai, "CALIBRATION_PATH", output):
                artifact = ai.load_calibration("synthetic-test-only")
                self.assertIsNotNone(artifact)
                self.assertIsNone(ai.load_calibration("different-model"))
                score = ai.calibrated_score(2.0, artifact)
                assert score is not None
                self.assertGreater(score["percent"], 80)
                # A changed artifact must not silently become an active score.
                edited = json.loads(output.read_text())
                edited["high_threshold"] = 0.9
                output.write_text(json.dumps(edited))
                self.assertIsNone(ai.load_calibration("synthetic-test-only"))

    def test_overlapping_split_ids_are_rejected_before_model_call(self):
        if not evaluation.USING_SKLEARN:
            self.skipTest("Full calibration requires working sklearn")
        with tempfile.TemporaryDirectory(prefix="diawatch-overlap-test-") as temp_dir:
            path = self.write_split(Path(temp_dir), "same")
            with patch.object(evaluation.httpx, "Client") as client, self.assertRaisesRegex(ValueError, "tumpang tindih"):
                evaluation.calibrate(path, path, path, "fixture", 0.2, 0.8, "fixture")
            client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
