import unittest

from scripts.cnae_utils import matches_reference, secondary_cnae_codes, valid_cnae


class DiscoverProspectsTests(unittest.TestCase):
    def test_extracts_primary_and_secondary_cnae_codes(self):
        self.assertEqual(valid_cnae("01.11-3/01"), "0111301")
        self.assertEqual(
            secondary_cnae_codes("01.11-3/01, 25.11-0/00"),
            {"0111301", "2511000"},
        )

    def test_matches_reference_name_without_guessing_partial_tokens(self):
        self.assertTrue(matches_reference("Palini Alves Equipamentos Ltda.", "PALINI ALVES"))
        self.assertFalse(matches_reference("Alves Equipamentos Ltda.", "PALINI ALVES"))


if __name__ == "__main__":
    unittest.main()
