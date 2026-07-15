sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "retail/analytics/retailinsights/model/formatter"
], function (Controller, JSONModel, formatter) {
    "use strict";

    // OData V4 service path (mounted at server root by CAP, see srv/insights-service.cds).
    var SERVICE = "/insights";

    // Semantic colours (hex) used to paint the VizFrame data points by category.
    var COLORS = {
        segment: { "VIP": "#107e3e", "Regular": "#e9730c", "At Risk": "#bb0000" },
        quadrant: { "Star": "#107e3e", "Margin Driven": "#e9a800", "Volume Driven": "#0070f2", "Laggard": "#bb0000" },
        tier: { "Flagship": "#107e3e", "Standard": "#e9a800", "Underperforming": "#bb0000", "Online Channel": "#6a6d70" }
    };

    return Controller.extend("retail.analytics.retailinsights.controller.Dashboard", {

        formatter: formatter,

        onInit: function () {
            // Current smart-filter + slider state. Sent as custom OData query options.
            this._state = {
                continent: null,
                country: null,
                ageCategory: null,
                vipThreshold: 12,
                flagshipPercentile: 20
            };
            // Active chart->table selections (chart->chart stays disabled by design).
            this._sel = { segment: null, productKey: null, storeKey: null };

            this.getView().setModel(new JSONModel({ continents: [], countries: [], _pairs: [] }), "geo");
            this.getView().setModel(new JSONModel({ donut: [], products: [], stores: [] }), "chart");
            this.getView().setModel(new JSONModel({ rows: [], count: 0, total: 0 }), "table");
            this.getView().setModel(new JSONModel({ vipCount: 0, starCount: 0, flagshipCount: 0 }), "kpi");
            this.getView().setModel(new JSONModel({
                vip: 12, flagship: 20,
                vipLabel: "VIP Score ≥ 12", flagshipLabel: "Flagship = Top 20%"
            }), "ui");

            this._loadGeo().then(this._reload.bind(this));
        },

        // ===================================================================
        // Data loading
        // ===================================================================
        _qs: function (extra) {
            var s = this._state, p = new URLSearchParams();
            if (s.continent) { p.set("continent", s.continent); }
            if (s.country) { p.set("country", s.country); }
            if (s.ageCategory) { p.set("ageCategory", s.ageCategory); }
            Object.keys(extra || {}).forEach(function (k) { p.set(k, extra[k]); });
            return p.toString();
        },

        _get: function (entity, extra) {
            var url = SERVICE + "/" + entity + "?" + this._qs(extra);
            return fetch(url, { headers: { "Accept": "application/json" } })
                .then(function (r) {
                    if (!r.ok) { throw new Error(entity + " " + r.status); }
                    return r.json();
                })
                .then(function (j) { return j.value || []; });
        },

        _loadGeo: function () {
            var oGeo = this.getView().getModel("geo");
            return fetch(SERVICE + "/CustomerGeo?$orderby=continent,country", { headers: { "Accept": "application/json" } })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    var pairs = j.value || [];
                    var continents = [{ key: "", text: "All" }];
                    pairs.map(function (p) { return p.continent; })
                        .filter(function (v, i, a) { return v && a.indexOf(v) === i; })
                        .sort()
                        .forEach(function (c) { continents.push({ key: c, text: c }); });
                    oGeo.setProperty("/_pairs", pairs);
                    oGeo.setProperty("/continents", continents);
                    oGeo.setProperty("/countries", [{ key: "", text: "All" }]);
                });
        },

        _reload: function () {
            var that = this;
            var s = this._state;
            // Reset chart selections on any data change so we never filter on a stale key.
            this._sel = { segment: null, productKey: null, storeKey: null };

            return Promise.all([
                this._get("CustomerSegmentation", { vipThreshold: s.vipThreshold }),
                this._get("ProductPerformance", {}),
                this._get("StoreEfficiency", { flagshipPercentile: s.flagshipPercentile }),
                this._get("OrderLines", { vipThreshold: s.vipThreshold, flagshipPercentile: s.flagshipPercentile, top: 2000 })
            ]).then(function (res) {
                var customers = res[0], products = res[1], stores = res[2], lines = res[3];

                // ---- KPIs (react to sliders + filters because data was re-fetched) ----
                that.getView().getModel("kpi").setData({
                    vipCount: customers.filter(function (c) { return c.CustomerSegment === "VIP"; }).length,
                    starCount: products.filter(function (p) { return p.ProductQuadrant === "Star"; }).length,
                    flagshipCount: stores.filter(function (s2) { return s2.StoreTier === "Flagship"; }).length
                });

                // ---- Charts ----
                var oChart = that.getView().getModel("chart");
                oChart.setProperty("/donut", that._buildDonut(customers));
                oChart.setProperty("/products", products);
                // Store scatter = physical stores only (Online has no footprint).
                oChart.setProperty("/stores", stores.filter(function (s2) {
                    return s2.StoreKey !== 0 && s2.SquareMeters && s2.RevenuePerSquareMeter != null;
                }));

                // ---- Table (full set kept for client-side chart filtering) ----
                that._allRows = lines;
                that._applyTableFilter();

                // ---- Chart cosmetics: semantic colours + median cross-lines ----
                that._styleDonut();
                that._styleProductChart(products);
                that._styleStoreChart();
            }).catch(function (e) {
                sap.ui.require(["sap/m/MessageToast"], function (MT) { MT.show("Load failed: " + e.message); });
            });
        },

        _buildDonut: function (customers) {
            var order = ["VIP", "Regular", "At Risk"], map = {}, total = 0;
            customers.forEach(function (c) {
                var seg = c.CustomerSegment;
                map[seg] = map[seg] || { Segment: seg, Count: 0, Revenue: 0 };
                map[seg].Count++;
                map[seg].Revenue += Number(c.TotalSpendUSD) || 0;
                total += Number(c.TotalSpendUSD) || 0;
            });
            return order.filter(function (s) { return map[s]; }).map(function (s) {
                var e = map[s];
                e.ContribPct = total ? Math.round((e.Revenue / total) * 1000) / 10 : 0;
                return e;
            });
        },

        // ===================================================================
        // VizFrame styling (colours / reference lines / tooltips)
        // ===================================================================
        _colourRules: function (dimName, colourMap) {
            return Object.keys(colourMap).map(function (key) {
                var ctx = {};
                ctx[dimName] = key;
                return { dataContext: ctx, properties: { color: colourMap[key] }, displayName: key };
            });
        },

        _styleDonut: function () {
            this.byId("donutChart").setVizProperties({
                title: { visible: false },
                legend: { visible: true },
                tooltip: { visible: true },
                plotArea: {
                    dataPointStyle: { rules: this._colourRules("Segment", COLORS.segment) },
                    dataLabel: { visible: true }
                }
            });
        },

        _styleProductChart: function (products) {
            var medMargin = products.length ? Number(products[0].MedianMargin) : 0;
            var medQty = products.length ? Number(products[0].MedianQuantity) : 0;
            // color feed = "Product" keeps one marker per product (granular); the
            // dataPointStyle rules below recolour each marker by its Quadrant value.
            this.byId("productChart").setVizProperties({
                title: { visible: false },
                legend: { visible: false },
                tooltip: { visible: true },
                plotArea: {
                    dataPointStyle: { rules: this._colourRules("Quadrant", COLORS.quadrant) },
                    // Median cross-lines that form the four quadrants. valueAxis = X (Quantity),
                    // valueAxis2 = Y (Margin). Rendering of axis2 reference lines depends on the
                    // running UI5 version; values are always exposed on each product row too.
                    referenceLine: {
                        line: {
                            valueAxis: [{ value: medQty, visible: true, size: 1, color: "#666666", label: { text: "Median Qty", visible: true } }],
                            valueAxis2: [{ value: medMargin, visible: true, size: 1, color: "#666666", label: { text: "Median Margin %", visible: true } }]
                        }
                    }
                },
                valueAxis: { title: { text: "Total Quantity Sold", visible: true } },
                valueAxis2: { title: { text: "Margin %", visible: true } }
            });
        },

        _styleStoreChart: function () {
            this.byId("storeChart").setVizProperties({
                title: { visible: false },
                legend: { visible: false },
                tooltip: { visible: true },
                plotArea: {
                    dataPointStyle: { rules: this._colourRules("Tier", COLORS.tier) }
                },
                valueAxis: { title: { text: "Square Meters", visible: true } },
                valueAxis2: { title: { text: "Total Revenue (USD)", visible: true } }
            });
        },

        // ===================================================================
        // Filter bar handlers
        // ===================================================================
        onContinentChange: function (oEvent) {
            var key = oEvent.getParameter("selectedItem").getKey();
            var oGeo = this.getView().getModel("geo");
            var oCountry = this.byId("countrySelect");

            this._state.continent = key || null;
            this._state.country = null;

            // Dependent dropdown: only countries of the chosen continent; disabled until one is picked.
            if (key) {
                var countries = [{ key: "", text: "All" }];
                oGeo.getProperty("/_pairs")
                    .filter(function (p) { return p.continent === key; })
                    .map(function (p) { return p.country; })
                    .filter(function (v, i, a) { return v && a.indexOf(v) === i; })
                    .sort()
                    .forEach(function (c) { countries.push({ key: c, text: c }); });
                oGeo.setProperty("/countries", countries);
                oCountry.setEnabled(true);
            } else {
                oGeo.setProperty("/countries", [{ key: "", text: "All" }]);
                oCountry.setEnabled(false);
            }
            oCountry.setSelectedKey("");
            this._reload();
        },

        onCountryChange: function (oEvent) {
            this._state.country = oEvent.getParameter("selectedItem").getKey() || null;
            this._reload();
        },

        onAgeChange: function (oEvent) {
            this._state.ageCategory = oEvent.getParameter("selectedItem").getKey() || null;
            this._reload();
        },

        onVipChange: function (oEvent) {
            var v = oEvent.getParameter("value");
            this._state.vipThreshold = v;
            var oUi = this.getView().getModel("ui");
            oUi.setProperty("/vip", v);
            oUi.setProperty("/vipLabel", "VIP Score ≥ " + v);
            this._reload();
        },

        onFlagshipChange: function (oEvent) {
            var v = oEvent.getParameter("value");
            this._state.flagshipPercentile = v;
            var oUi = this.getView().getModel("ui");
            oUi.setProperty("/flagship", v);
            oUi.setProperty("/flagshipLabel", "Flagship = Top " + v + "%");
            this._reload();
        },

        // ===================================================================
        // Chart -> Table interaction (chart -> chart intentionally NOT wired)
        // ===================================================================
        _selData: function (oEvent) {
            var d = oEvent.getParameter("data");
            return (d && d.length) ? d[0].data : null;
        },

        onDonutSelect: function (oEvent) {
            var d = this._selData(oEvent);
            if (d) { this._sel.segment = d.Segment; this._applyTableFilter(); }
        },
        onDonutDeselect: function () { this._sel.segment = null; this._applyTableFilter(); },

        onProductSelect: function (oEvent) {
            var d = this._selData(oEvent);
            if (d) { this._sel.productKey = Number(d.ProductKey); this._applyTableFilter(); }
        },
        onProductDeselect: function () { this._sel.productKey = null; this._applyTableFilter(); },

        onStoreSelect: function (oEvent) {
            var d = this._selData(oEvent);
            if (d) { this._sel.storeKey = Number(d.StoreKey); this._applyTableFilter(); }
        },
        onStoreDeselect: function () { this._sel.storeKey = null; this._applyTableFilter(); },

        onClearChartFilters: function () {
            this._sel = { segment: null, productKey: null, storeKey: null };
            this.byId("donutChart").vizSelection([]);
            this.byId("productChart").vizSelection([]);
            this.byId("storeChart").vizSelection([]);
            this._applyTableFilter();
        },

        _applyTableFilter: function () {
            var sel = this._sel;
            var rows = (this._allRows || []).filter(function (r) {
                if (sel.segment && r.CustomerSegment !== sel.segment) { return false; }
                if (sel.productKey != null && Number(r.ProductKey) !== sel.productKey) { return false; }
                if (sel.storeKey != null && Number(r.StoreKey) !== sel.storeKey) { return false; }
                return true;
            });
            var oTable = this.getView().getModel("table");
            oTable.setProperty("/rows", rows);
            oTable.setProperty("/count", rows.length);
            oTable.setProperty("/total", (this._allRows || []).length);
        }
    });
});
