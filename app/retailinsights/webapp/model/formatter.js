sap.ui.define([], function () {
    "use strict";

    /*
     * Maps the textual classifications to sap.ui.core.ValueState so the table's
     * ObjectStatus cells render in the required semantic colours:
     *   Success = Green, Warning = Yellow, Error = Red, Information = Blue, None = Grey
     */
    return {
        segmentState: function (sSegment) {
            switch (sSegment) {
                case "VIP": return "Success";      // Green
                case "Regular": return "Warning";  // Yellow
                case "At Risk": return "Error";    // Red
                default: return "None";
            }
        },

        quadrantState: function (sQuadrant) {
            switch (sQuadrant) {
                case "Star": return "Success";            // Green
                case "Margin Driven": return "Warning";   // Yellow
                case "Volume Driven": return "Information";// Blue
                case "Laggard": return "Error";           // Red
                default: return "None";
            }
        },

        tierState: function (sTier) {
            switch (sTier) {
                case "Flagship": return "Success";        // Green
                case "Standard": return "Warning";        // Yellow
                case "Underperforming": return "Error";   // Red
                case "Online Channel": return "None";     // Grey
                default: return "None";
            }
        }
    };
});
