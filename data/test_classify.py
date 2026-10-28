import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from classify import classify_file, group_by_category


class TestClassifier(unittest.TestCase):
    def test_draft_has_highest_priority(self) -> None:
        name = "Code on Wages Draft Rules, 2020 (Pre-publish).pdf"
        self.assertEqual(classify_file(name), "draft")

    def test_rules_overrides_code(self) -> None:
        name = "Code on Social Security Rules, 2021.pdf"
        self.assertEqual(classify_file(name), "rules")

    def test_core_code_detection(self) -> None:
        self.assertEqual(classify_file("Code on Wages, 2019.pdf"), "core_code")

    def test_core_act_detection(self) -> None:
        self.assertEqual(classify_file("The Factories Act, 1948.pdf"), "core_act")

    def test_supporting_act_fallback(self) -> None:
        self.assertEqual(classify_file("Equal Remuneration Act, 1975.pdf"), "supporting_act")

    def test_irrelevant_niche_detection(self) -> None:
        self.assertEqual(
            classify_file("Motor Transport Labour Welfare Scheme, 1981.pdf"),
            "irrelevant",
        )

    def test_optional_default(self) -> None:
        self.assertEqual(
            classify_file("Model Shops and Establishments Bill, 2016.pdf"),
            "optional_act",
        )

    def test_grouped_output_shape(self) -> None:
        mapping = {
            "a.pdf": "core_code",
            "b.pdf": "rules",
            "c.pdf": "supporting_act",
        }
        grouped = group_by_category(mapping)
        self.assertIn("core_code", grouped)
        self.assertIn("draft", grouped)
        self.assertEqual(grouped["core_code"], ["a.pdf"])
        self.assertEqual(grouped["rules"], ["b.pdf"])


if __name__ == "__main__":
    unittest.main()
