namespace retail.analytics;

/**
 * Retail analytics data model.
 *
 * Natural keys from the source data are preserved (CustomerKey, ProductKey,
 * StoreKey, and the composite keys on Sales and ExchangeRates) so the cleaned
 * CSVs load directly and foreign keys stay meaningful.
 */

entity Customers {
  key CustomerKey : Integer;
      gender      : String(10);
      name        : String(200);
      city        : String(100);
      stateCode   : String(10);
      state       : String(100);
      zipCode     : String(20);          // String: preserves leading zeros / non-numeric codes
      country     : String(100);
      continent   : String(50);
      birthday    : Date;

      sales       : Association to many Sales on sales.customer = $self;
}

entity Products {
  key ProductKey    : Integer;
      productName    : String(300);
      brand          : String(100);
      color          : String(50);
      unitCostUSD    : Decimal(12, 2);   // source "$" + thousands separators stripped on load
      unitPriceUSD   : Decimal(12, 2);
      subcategoryKey : Integer;
      subcategory    : String(100);
      categoryKey    : Integer;
      category       : String(100);

      sales          : Association to many Sales on sales.product = $self;
}

entity Stores {
  key StoreKey     : Integer;            // 0 = Online store
      country      : String(100);
      state        : String(100);
      squareMeters : Decimal(12, 2) null;// null for the Online store
      openDate     : Date;

      sales        : Association to many Sales on sales.store = $self;
}

entity Sales {
  key orderNumber  : Integer;            // composite PK part 1
  key lineItem     : Integer;            // composite PK part 2
      orderDate    : Date;
      deliveryDate : Date null;          // blank in ~79% of source rows
      customer     : Association to Customers;
      store        : Association to Stores;
      product      : Association to Products;
      quantity     : Integer;
      currencyCode : String(3);          // links to ExchangeRates by (currencyCode, orderDate)
}

entity ExchangeRates {
  key date     : Date;                   // composite PK part 1
  key currency : String(3);              // composite PK part 2
      exchange : Decimal(15, 6);         // rate vs. USD
}
