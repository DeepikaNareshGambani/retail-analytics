sap.ui.define([], function () {
  "use strict";

  var SUGGESTIONS = [
    "Why did profit drop in the UK despite high sales volume?",
    "Which stores are space-inefficient?",
    "What does price elasticity look like?",
    "Who over-indexes on cameras?"
  ];

  return {
    /** Toolbar action: download the RPT-1 "Annual Global Sales Review" PDF. */
    onDownloadReport: function () {
      window.open("/reports/global-review.pdf", "_blank");
    },

    /** Toolbar action: open the Virtual Store Manager chat dialog. */
    onAskAssistant: function () {
      sap.ui.require([
        "sap/m/Dialog", "sap/m/Input", "sap/m/Button", "sap/m/Text", "sap/m/VBox",
        "sap/m/HBox", "sap/m/Bar", "sap/m/Title", "sap/m/ScrollContainer",
        "sap/ui/core/Icon", "sap/m/FlexItemData"
      ], function (Dialog, Input, Button, Text, VBox, HBox, Bar, Title, ScrollContainer, Icon, FlexItemData) {

        var oMessages = new VBox({ width: "100%" });
        var oScroll = new ScrollContainer({
          vertical: true, horizontal: false, height: "27rem", width: "100%",
          content: [oMessages]
        }).addStyleClass("rsaChatScroll");

        function scrollToBottom() {
          setTimeout(function () { var d = oScroll.getDomRef(); if (d) d.scrollTop = d.scrollHeight; }, 30);
        }

        function addBubble(sText, bUser, sExtraClass) {
          var oBubble = new VBox({ items: [new Text({ text: sText })] })
            .addStyleClass("rsaBubble " + (bUser ? "rsaBubbleUser" : "rsaBubbleAI") + (sExtraClass ? " " + sExtraClass : ""));
          var aItems = bUser
            ? [oBubble]
            : [new Icon({ src: "sap-icon://ai" }).addStyleClass("rsaAvatar"), oBubble];
          var oRow = new HBox({ justifyContent: bUser ? "End" : "Start", items: aItems }).addStyleClass("rsaMsgRow");
          oMessages.addItem(oRow);
          scrollToBottom();
          return oRow;
        }

        function ask(sQuestion) {
          var q = (sQuestion || "").trim();
          if (!q) { return; }
          oInput.setValue("");
          addBubble(q, true);
          var oTyping = addBubble("Thinking…", false, "rsaTyping");
          var sVal = q.replace(/'/g, "''");
          fetch("/ai/explainKPI(question='" + encodeURIComponent(sVal) + "')", { headers: { Accept: "application/json" } })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              oMessages.removeItem(oTyping); oTyping.destroy();
              var parsed = typeof d.value === "string" ? JSON.parse(d.value) : d.value;
              addBubble(parsed && parsed.answer ? parsed.answer : "No answer.", false);
            })
            .catch(function (e) {
              oMessages.removeItem(oTyping); oTyping.destroy();
              addBubble("Sorry — the assistant is unavailable right now (" + e.message + ").", false);
            });
        }

        var oInput = new Input({
          placeholder: "Ask about revenue, a country, store efficiency, elasticity…",
          submit: function () { ask(oInput.getValue()); },
          layoutData: new FlexItemData({ growFactor: 1 })
        });
        var oSend = new Button({ icon: "sap-icon://paper-plane", type: "Emphasized", tooltip: "Send", press: function () { ask(oInput.getValue()); } });
        var oInputBar = new HBox({ alignItems: "Center", items: [oInput, oSend] }).addStyleClass("rsaInputBar");

        var oDialog = new Dialog({
          contentWidth: "44rem",
          contentHeight: "33rem",
          stretchOnPhone: true,
          draggable: true,
          resizable: true,
          customHeader: new Bar({
            contentLeft: [
              new Icon({ src: "sap-icon://ai" }).addStyleClass("rsaHeaderIcon"),
              new Title({ text: "Virtual Store Manager" })
            ],
            contentRight: [ new Button({ icon: "sap-icon://decline", type: "Transparent", tooltip: "Close", press: function () { oDialog.close(); } }) ]
          }),
          content: [ new VBox({ width: "100%", items: [ oScroll, oInputBar ] }) ]
        }).addStyleClass("rsaChatDialog");

        oDialog.open();

        // Welcome + suggested question chips
        addBubble("Hi! I'm your Virtual Store Manager. I answer only from the live sales data and won't speculate beyond it. Try one of these:", false);
        var oChips = new HBox({ wrap: "Wrap", items: SUGGESTIONS.map(function (s) {
          return new Button({ text: s, press: function () { ask(s); } }).addStyleClass("rsaChip");
        }) }).addStyleClass("rsaChips");
        oMessages.addItem(new HBox({ justifyContent: "Start", items: [oChips] }).addStyleClass("rsaMsgRow"));

        setTimeout(function () { oInput.focus(); }, 150);
      });
    }
  };
});
