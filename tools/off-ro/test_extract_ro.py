import unittest

from extract_ro import romania_rows, valid_ean

HEADER = "code\tproduct_name\tbrands\tquantity\tcountries_tags\n"


class Tests(unittest.TestCase):
    def test_valid_ean(self):
        self.assertTrue(valid_ean("4006381333931"))  # EAN-13 real (Stabilo)
        self.assertTrue(valid_ean("96385074"))  # EAN-8 valid
        self.assertFalse(valid_ean("4006381333932"))
        self.assertFalse(valid_ean("123"))
        self.assertFalse(valid_ean("abc"))

    def test_romania_rows(self):
        lines = [
            HEADER,
            "4006381333931\tPix\tStabilo\t1 buc\ten:romania,en:france\n",
            "4006381333931\tAltul\tX\t1\ten:france\n",
            "4006381333932\tEAN greșit\tX\t1\ten:romania\n",
            "scurt\n",
        ]
        rows = list(romania_rows(lines))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["product_name"], "Pix")

    def test_missing_columns(self):
        with self.assertRaises(ValueError):
            list(romania_rows(["code\tname\n", "1\t2\n"]))


if __name__ == "__main__":
    unittest.main()
