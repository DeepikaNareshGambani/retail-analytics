sap.ui.define([], function () {
  "use strict";

  // Call the Explanation Bot (read-only OData function -> GET, no CSRF needed).
  function askBot(question, onText) {
    onText("Thinking…");
    var val = String(question).replace(/'/g, "''");
    var url = "/ai/explainKPI(question='" + encodeURIComponent(val) + "')";
    fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var parsed = typeof d.value === "string" ? JSON.parse(d.value) : d.value;
        onText(parsed.answer || "No answer.");
      })
      .catch(function (e) { onText("Sorry — the assistant is unavailable: " + e.message); });
  }

  return {
    /** Toolbar action: download the RPT-1 "Annual Global Sales Review" PDF. */
    onDownloadReport: function () {
      window.open("/reports/global-review.pdf", "_blank");
    },

    /** Toolbar action: open the Virtual Store Manager chat dialog. */
    onAskAssistant: function () {
      sap.ui.require([
        "sap/m/Dialog", "sap/m/Input", "sap/m/Button", "sap/m/Text",
        "sap/m/VBox", "sap/m/Label", "sap/m/Bar", "sap/m/Title"
      ], function (Dialog, Input, Button, Text, VBox, Label, Bar, Title) {
        var oAnswer = new Text({ text: "Ask about revenue, margins, a country, store efficiency, price elasticity, demographics, or seasonality." });
        var oInput = new Input({
          width: "100%",
          placeholder: "e.g. Why did profit drop in the UK despite high sales volume?",
          submit: function () { askBot(oInput.getValue(), oAnswer.setText.bind(oAnswer)); }
        });
        var oDialog = new Dialog({
          contentWidth: "40rem",
          customHeader: new Bar({ contentMiddle: [ new Title({ text: "Virtual Store Manager" }) ] }),
          content: [
            new VBox({
              items: [
                new Label({ text: "Grounded in the live KPI snapshot — it will not speculate beyond the data." }),
                oInput,
                new Button({ text: "Ask", type: "Emphasized", press: function () { askBot(oInput.getValue(), oAnswer.setText.bind(oAnswer)); } }),
                new Text({ text: " " }),
                oAnswer
              ]
            }).addStyleClass("sapUiContentPadding")
          ],
          endButton: new Button({ text: "Close", press: function () { oDialog.close(); } }),
          afterClose: function () { oDialog.destroy(); }
        });
        oDialog.open();
      });
    }
  };
});
