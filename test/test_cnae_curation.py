import unittest

from scripts.cnae_curation import assess_cnae, related_cnaes


class CnaeCurationTests(unittest.TestCase):
    def test_approves_metal_structure_activity(self):
        result = assess_cnae("2511000", "Fabricação de estruturas metálicas", 12, 1000, 20)
        self.assertEqual(result.review_status, "approved")
        self.assertGreaterEqual(result.fit_score, 60)

    def test_rejects_administrative_activity(self):
        result = assess_cnae("6920601", "Atividades de contabilidade", 15, 1000, 20)
        self.assertEqual(result.review_status, "rejected")

    def test_keeps_small_sample_pending(self):
        result = assess_cnae("2511000", "Fabricação de estruturas metálicas", 1, 1000, 20)
        self.assertEqual(result.review_status, "pending")

    def test_expands_only_same_five_digit_class(self):
        descriptions = {"2511000": "Estruturas metálicas", "2511001": "Outra subclasse", "2521700": "Tanques"}
        result = related_cnaes("2511000", descriptions)
        self.assertEqual({item[0] for item in result}, {"2511000", "2511001"})
        self.assertEqual(dict((item[0], item[2]) for item in result)["2511001"], "same_class")


if __name__ == "__main__":
    unittest.main()
