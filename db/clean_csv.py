#!/usr/bin/env python3
"""Produce CAP-loadable cleaned copies of the source CSVs.

Originals in db/data/*.csv are left untouched. Cleaned copies are written as
db/data/retail.analytics-<Entity>.csv with headers matching the CDS element
names (and association foreign-key column names), and money fields stripped of
'$', thousands separators, and surrounding whitespace.
"""
import csv
import os

HERE = os.path.dirname(__file__)
SRC_DIR = os.path.join(HERE, "data-raw")   # untouched original source CSVs
OUT_DIR = os.path.join(HERE, "data")       # cleaned, CAP-loadable copies


def money(value):
    """'$1,060.22 ' -> '1060.22'; '' -> '' (null)."""
    v = value.strip().lstrip("$").strip().replace(",", "")
    return v


def passthrough(value):
    return value.strip()


def convert(src_name, out_name, out_header, row_builder):
    src = os.path.join(SRC_DIR, src_name)
    out = os.path.join(OUT_DIR, out_name)
    with open(src, newline="", encoding="utf-8-sig") as fin, \
         open(out, "w", newline="", encoding="utf-8") as fout:
        reader = csv.DictReader(fin)
        writer = csv.writer(fout)
        writer.writerow(out_header)
        n = 0
        for row in reader:
            writer.writerow(row_builder(row))
            n += 1
    print(f"  {out_name}: {n} rows")


print("Writing cleaned CSVs...")

# Customers ---------------------------------------------------------------
convert(
    "Customers.csv",
    "retail.analytics-Customers.csv",
    ["CustomerKey", "gender", "name", "city", "stateCode", "state",
     "zipCode", "country", "continent", "birthday"],
    lambda r: [
        r["CustomerKey"], r["Gender"], r["Name"], r["City"],
        r["State Code"], r["State"], r["Zip Code"], r["Country"],
        r["Continent"], r["Birthday"],
    ],
)

# Products (strip $ and thousands separators from money fields) ------------
convert(
    "Products.csv",
    "retail.analytics-Products.csv",
    ["ProductKey", "productName", "brand", "color", "unitCostUSD",
     "unitPriceUSD", "subcategoryKey", "subcategory", "categoryKey", "category"],
    lambda r: [
        r["ProductKey"], r["Product Name"], r["Brand"], r["Color"],
        money(r["Unit Cost USD"]), money(r["Unit Price USD"]),
        r["SubcategoryKey"], r["Subcategory"], r["CategoryKey"], r["Category"],
    ],
)

# Stores (blank Square Meters -> empty/null) ------------------------------
convert(
    "Stores.csv",
    "retail.analytics-Stores.csv",
    ["StoreKey", "country", "state", "squareMeters", "openDate"],
    lambda r: [
        r["StoreKey"], r["Country"], r["State"],
        passthrough(r["Square Meters"]), r["Open Date"],
    ],
)

# Sales (rename source keys to association FK column names) ----------------
convert(
    "Sales.csv",
    "retail.analytics-Sales.csv",
    ["orderNumber", "lineItem", "orderDate", "deliveryDate",
     "customer_CustomerKey", "store_StoreKey", "product_ProductKey",
     "quantity", "currencyCode"],
    lambda r: [
        r["Order Number"], r["Line Item"], r["Order Date"], r["Delivery Date"],
        r["CustomerKey"], r["StoreKey"], r["ProductKey"],
        r["Quantity"], r["Currency Code"],
    ],
)

# Exchange Rates ----------------------------------------------------------
convert(
    "Exchange_Rates.csv",
    "retail.analytics-ExchangeRates.csv",
    ["date", "currency", "exchange"],
    lambda r: [r["Date"], r["Currency"], r["Exchange"]],
)

print("Done.")
