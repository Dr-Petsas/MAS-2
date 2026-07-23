# Misst die Kopf-Hoehe der iPad-App im Schema-Schritt (iPad Landscape 1180x820)
# und rendert Testdaten ins Schema (27 Krone etc.), Screenshot optional.
import json
import sys
from playwright.sync_api import sync_playwright

SHOT = sys.argv[1] if len(sys.argv) > 1 else ""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1180, "height": 820}, device_scale_factor=2)
    pg.add_init_script(
        """localStorage.setItem('pickadoc.ipad.v1', JSON.stringify({
          clientId: 'testclient', locationId: 'testloc', deviceId: 'testdev',
          deviceKey: 'testkey', operatorName: 'Dr. Test', doctorName: 'Dr. Test'
        }));"""
    )
    pg.goto("http://127.0.0.1:4000/m/ipad-app.html", wait_until="domcontentloaded")
    pg.wait_for_timeout(1200)
    print("url:", pg.url)
    print("hasModeSwitch:", pg.evaluate("() => !!document.getElementById('modeSwitch')"))
    pg.click('#modeSwitch button[data-mode="doku"]')
    pg.click('.step-chip[data-step="3"]')
    pg.wait_for_timeout(400)
    # Testdaten wie Live-Diktat: benutzte Kuerzel + zuletzt erkannt "27 Krone"
    pg.evaluate(
        """() => {
          const st = LenaDokuZahn.emptyState("");
          st.page = "schema";
          LenaDokuZahn.applySchemaSegments(st, [
            { text: "13,14,15 fehlen", startMs: Date.now() - 9000 },
            { text: "16 Karies", startMs: Date.now() - 7000 },
            { text: "17 Füllung", startMs: Date.now() - 5000 },
            { text: "27 Krone", startMs: Date.now() - 300 },
          ]);
          window.__testState = st;
          LenaDokuZahn.renderSchemaOnly(document.getElementById("schemaTpl"), st);
        }"""
    )
    pg.wait_for_timeout(250)
    m = pg.evaluate(
        """() => {
          const r = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const b = el.getBoundingClientRect();
            return { top: Math.round(b.top), h: Math.round(b.height) };
          };
          const flash = document.querySelector('.zs-leg.is-flash');
          return {
            chrome: r('header.chrome'),
            steps: r('#paneDoku .steps'),
            recTop: r('#wiz3 .rec-top'),
            dokuWrap: r('#wiz3 .doku-wrap--schema'),
            schema: r('#schemaTpl .zs-schema'),
            legend: r('#schemaTpl .zs-legend'),
            legendChips: document.querySelectorAll('#schemaTpl .zs-leg').length,
            flashChip: flash ? flash.getAttribute('data-code') : null,
            headTotal: r('#wiz3 .doku-wrap--schema') ? Math.round(document.querySelector('#wiz3 .doku-wrap--schema').getBoundingClientRect().top) : null,
          };
        }"""
    )
    print(json.dumps(m, indent=2))
    if SHOT:
        pg.wait_for_timeout(300)
        pg.screenshot(path=SHOT)
        print("shot:", SHOT)
    b.close()
