sap.ui.define(
    ["sap/fe/core/AppComponent"],
    function (AppComponent) {
        "use strict";

        return AppComponent.extend("retail.analytics.retailassistant.Component", {
            metadata: {
                manifest: "json"
            },

            /**
             * There is only ever one dashboard object (AIDashboards(1)). Skip the
             * List Report landing and open the Object Page dashboard directly by
             * redirecting the list route straight to the object.
             */
            init: function () {
                AppComponent.prototype.init.apply(this, arguments);
                var oRouter = this.getRouter();
                oRouter.attachRouteMatched(function (oEvent) {
                    if (oEvent.getParameter("name") === "DashboardList") {
                        oRouter.navTo("Dashboard", { key: "1" }, true /* replace history */);
                    }
                });
            }
        });
    }
);
