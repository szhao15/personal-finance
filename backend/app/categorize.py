"""Choosing a category for an imported row. First match wins:

1. Your rules ("description contains X" -> category)
2. History: the category this merchant had most recently in your data
3. The bank's own category, when the parser judged it specific enough
4. Built-in list of common merchants
Otherwise the row stays Uncategorized.
"""

import re

from .statements import Row

# Category names follow Chase's, since that is what existing data uses.
# Keywords match whole words of the cleaned merchant name (see statements.merchant_key).
BUILT_IN = {
    "Groceries": [
        "TRADER JOE", "WHOLE FOODS", "WHOLEFDS", "ALDI", "KROGER", "SAFEWAY", "PUBLIX", "WEGMANS",
        "LUNDS", "BYERLYS", "CUB FOODS", "HY VEE", "HYVEE", "SPROUTS", "H E B", "HEB", "FOOD LION",
        "STOP & SHOP", "GIANT EAGLE", "MEIJER", "RALPHS", "INSTACART", "UNITED NOODLES",
    ],
    "Food & Drink": [
        "STARBUCKS", "DUNKIN", "MCDONALD", "CHIPOTLE", "SUBWAY", "PANERA", "TACO BELL", "WENDY",
        "BURGER KING", "CHICK FIL A", "DOMINO", "PIZZA HUT", "PANDA EXPRESS", "SWEETGREEN",
        "CAVA", "SHAKE SHACK", "DOORDASH", "GRUBHUB", "UBER EATS", "UBEREATS", "CAFE", "COFFEE",
        "RESTAURANT", "PIZZA", "BAKERY", "BAR & GRILL", "TAQUERIA", "SUSHI",
    ],
    "Gas": ["SHELL", "EXXON", "EXXONMOBIL", "MOBIL", "CHEVRON", "BP", "SUNOCO", "CITGO", "SPEEDWAY", "HOLIDAY STATIONSTORE", "KWIK TRIP", "MARATHON", "VALERO", "CIRCLE K", "WAWA", "SHEETZ", "QUIKTRIP"],
    "Travel": [
        "UBER", "LYFT", "DELTA AIR", "UNITED AIRLINES", "AMERICAN AIRLINES", "SOUTHWEST AIR", "ALASKA AIR",
        "JETBLUE", "SPIRIT AIRL", "FRONTIER AIR", "AIRBNB", "MARRIOTT", "HILTON", "HYATT", "EXPEDIA",
        "HOTELS COM", "AMTRAK", "HERTZ", "ENTERPRISE RENT", "AVIS", "PARKING", "METRO TRANSIT",
    ],
    "Shopping": ["AMAZON", "AMZN", "TARGET", "WALMART", "COSTCO", "BEST BUY", "IKEA", "ETSY", "EBAY", "APPLE STORE", "NORDSTROM", "MACY", "UNIQLO", "REI"],
    "Entertainment": [
        "NETFLIX", "SPOTIFY", "HULU", "DISNEY PLUS", "DISNEYPLUS", "HBO", "MAX COM", "YOUTUBE",
        "AMC", "REGAL", "CINEMA", "THEATER", "THEATRE", "FILM SOCIETY", "TICKETMASTER", "STEAM",
        "PLAYSTATION", "XBOX", "NINTENDO",
    ],
    "Bills & Utilities": ["VERIZON", "AT&T", "T MOBILE", "COMCAST", "XFINITY", "SPECTRUM", "XCEL ENERGY", "ELECTRIC", "WATER", "INTERNET"],
    "Health & Wellness": [
        "LA FITNESS", "PLANET FITNESS", "LIFE TIME", "LIFETIME FITNESS", "ANYTIME FITNESS", "EQUINOX",
        "ORANGETHEORY", "CVS", "WALGREENS", "PHARMACY", "DENTAL", "CLINIC", "GYM",
    ],
    "Home": ["HOME DEPOT", "LOWE", "MENARDS", "BED BATH", "WAYFAIR", "ACE HARDWARE"],
    "Personal": ["GREAT CLIPS", "SALON", "BARBER", "SEPHORA", "ULTA"],
}

_BUILT_IN_PATTERNS = [
    (re.compile(rf"(?<![A-Z]){re.escape(word)}(?![A-Z])"), category)
    for category, words in BUILT_IN.items()
    for word in words
]


def built_in_category(merchant_key: str) -> str | None:
    return next((category for pattern, category in _BUILT_IN_PATTERNS if pattern.search(merchant_key)), None)


def categorize_rows(rules: list[tuple[str, str]], history: dict[str, str], rows: list[Row]) -> list[str | None]:
    """Category for each row. A refund takes the category of the purchase it reverses, from your
    history or from the same file, so it cancels that purchase out instead of showing up as
    negative spending in another category (e.g. Uncategorized)."""
    names = [pick_category(rules, history, r) for r in rows]
    purchases: dict[str, str] = {}
    for row, name in zip(rows, names):
        if name and row.amount < 0 and not row.is_transfer:
            purchases.setdefault(row.merchant_key, name)
    with_purchases = {**purchases, **history}  # earlier history wins, then purchases in this file
    return [
        pick_category(rules, with_purchases, row) if row.amount > 0 and not row.is_transfer else name
        for row, name in zip(rows, names)
    ]


def pick_category(rules: list[tuple[str, str]], history: dict[str, str], row: Row) -> str | None:
    """rules: (upper-case match text, category) in priority order; history: merchant_key -> category."""
    merchant = row.merchant.upper()
    return (
        next((name for text, name in rules if text in merchant), None)
        or history.get(row.merchant_key)
        or row.bank_category
        or built_in_category(row.merchant_key)
    )
