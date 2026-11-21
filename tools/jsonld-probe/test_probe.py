import unittest

from probe import extract_product

PAGE = """<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"BreadcrumbList"},
 {"@type":["Product"],"name":"Lapte","brand":{"@type":"Brand","name":"X"},"gtin13":"4006381333931","sku":"1",
  "offers":{"@type":"Offer","price":"5.99","priceCurrency":"RON","availability":"https://schema.org/InStock"}}]}</script>
<script type="application/ld+json">{ not json </script>
</head></html>"""


class Tests(unittest.TestCase):
    def test_product_in_graph(self):
        p = extract_product(PAGE)
        self.assertEqual(p["gtin"], {"gtin13": "4006381333931"})
        self.assertEqual(p["price"], "5.99")
        self.assertEqual(p["currency"], "RON")
        self.assertTrue(p["brand"])

    def test_no_product(self):
        self.assertIsNone(extract_product("<html><script type='application/ld+json'>{\"@type\":\"Organization\"}</script></html>"))
        self.assertIsNone(extract_product("<html></html>"))


if __name__ == "__main__":
    unittest.main()
