// Handles DOM updates, event listeners binding, and tab transitions for the Dashboard UI.

export class AppUI {
  constructor(callbacks) {
    this.callbacks = callbacks;
    
    // Store DOM elements
    this.elements = {
      sidebar: document.getElementById('sidebar'),
      tabs: document.querySelectorAll('.tab-btn'),
      panels: document.querySelectorAll('.tab-panel'),
      
      // Scorecard elements
      scorecardEmpty: document.getElementById('scorecard-empty'),
      scorecardContent: document.getElementById('scorecard-content'),
      overallScoreText: document.getElementById('overall-score-val'),
      overallScoreCircle: document.getElementById('overall-score-circle'),
      inspectCoordsText: document.getElementById('inspect-coords'),
      
      // Category scores list
      transitScoreVal: document.getElementById('score-transit-val'),
      transitScoreBar: document.getElementById('score-transit-bar'),
      transitDetail: document.getElementById('score-transit-detail'),
      
      parkScoreVal: document.getElementById('score-park-val'),
      parkScoreBar: document.getElementById('score-park-bar'),
      parkDetail: document.getElementById('score-park-detail'),
      
      healthScoreVal: document.getElementById('score-health-val'),
      healthScoreBar: document.getElementById('score-health-bar'),
      healthDetail: document.getElementById('score-health-detail'),
      
      safetyScoreVal: document.getElementById('score-safety-val'),
      safetyScoreBar: document.getElementById('score-safety-bar'),
      safetyDetail: document.getElementById('score-safety-detail'),
      floodWarningCard: document.getElementById('flood-warning-card'),
      
      // Simulation slider elements
      transitSlider: document.getElementById('slider-transit'),
      transitSliderVal: document.getElementById('slider-transit-val'),
      parkSlider: document.getElementById('slider-park'),
      parkSliderVal: document.getElementById('slider-park-val'),
      healthSlider: document.getElementById('slider-health'),
      healthSliderVal: document.getElementById('slider-health-val'),
      safetySlider: document.getElementById('slider-safety'),
      safetySliderVal: document.getElementById('slider-safety-val'),
      
      // Layer toggles
      layerToggles: document.querySelectorAll('.layer-checkbox'),
      
      // Base map selectors
      basemapBtns: document.querySelectorAll('.basemap-btn'),
      
      // KPI values
      kpiTotalPop: document.getElementById('kpi-total-pop'),
      kpiTransitPct: document.getElementById('kpi-transit-pct'),
      kpiParkPct: document.getElementById('kpi-park-pct'),
      kpiHealthPct: document.getElementById('kpi-health-pct'),
      kpiSafetyPct: document.getElementById('kpi-safety-pct'),
      kpiBlindPct: document.getElementById('kpi-blind-pct'),
      kpiFullyPct: document.getElementById('kpi-fully-pct'),

      // Mobile toggles
      sidebarToggleBtn: document.getElementById('sidebar-toggle-btn')
    };

    this.initEventListeners();
  }

  initEventListeners() {
    // 1. Tab switches
    this.elements.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        this.switchTab(tabId);
      });
    });

    // 2. Simulation Sliders
    const setupSlider = (slider, valSpan, key) => {
      if (slider && valSpan) {
        slider.addEventListener('input', (e) => {
          const value = parseFloat(e.target.value);
          const displayVal = value >= 1 ? `${value} กม.` : `${value * 1000} ม.`;
          valSpan.textContent = displayVal;
          if (this.callbacks.onSliderChange) {
            this.callbacks.onSliderChange(key, value);
          }
        });
      }
    };

    setupSlider(this.elements.transitSlider, this.elements.transitSliderVal, 'transit');
    setupSlider(this.elements.parkSlider, this.elements.parkSliderVal, 'park');
    setupSlider(this.elements.healthSlider, this.elements.healthSliderVal, 'health');
    setupSlider(this.elements.safetySlider, this.elements.safetySliderVal, 'safety');

    // 3. Layer Toggles
    this.elements.layerToggles.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const layerName = e.target.dataset.layer;
        const visible = e.target.checked;
        if (this.callbacks.onLayerToggle) {
          this.callbacks.onLayerToggle(layerName, visible);
        }
      });
    });

    // 4. Base Map Switching
    this.elements.basemapBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.elements.basemapBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const basemap = btn.dataset.basemap;
        if (this.callbacks.onBasemapChange) {
          this.callbacks.onBasemapChange(basemap);
        }
      });
    });

    // 5. Sidebar Toggle
    if (this.elements.sidebarToggleBtn) {
      this.elements.sidebarToggleBtn.addEventListener('click', () => {
        this.elements.sidebar.classList.toggle('collapsed');
      });
    }

    // 6. Clickable Category Score Cards (to toggle shortest path route visualization)
    const cards = document.querySelectorAll('.score-category-card');
    const catKeys = ['transit', 'park', 'health', 'safety'];
    cards.forEach((card, idx) => {
      card.style.cursor = 'pointer';
      
      // Highlight the first card (transit) by default
      if (idx === 0) {
        card.classList.add('active-inspect-card');
      }

      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('active-inspect-card'));
        card.classList.add('active-inspect-card');
        
        if (this.callbacks.onInspectCategoryChange) {
          this.callbacks.onInspectCategoryChange(catKeys[idx]);
        }
      });
    });
  }

  switchTab(tabId) {
    this.elements.tabs.forEach(tab => {
      if (tab.dataset.tab === tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    this.elements.panels.forEach(panel => {
      if (panel.id === `panel-${tabId}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    if (this.callbacks.onTabChange) {
      this.callbacks.onTabChange(tabId);
    }
  }

  resetInspectCardHighlights() {
    const cards = document.querySelectorAll('.score-category-card');
    cards.forEach((card, idx) => {
      card.classList.remove('active-inspect-card');
      if (idx === 0) {
        card.classList.add('active-inspect-card');
      }
    });
  }

  /**
   * Updates the Scorecard UI elements with analyzed location data.
   */
  updateScorecard(results, latlng) {
    if (!results) {
      this.elements.scorecardEmpty.style.display = 'flex';
      this.elements.scorecardContent.style.display = 'none';
      return;
    }

    this.elements.scorecardEmpty.style.display = 'none';
    this.elements.scorecardContent.style.display = 'block';

    const latStr = latlng.lat.toFixed(5);
    const lngStr = latlng.lng.toFixed(5);
    this.elements.inspectCoordsText.textContent = `พิกัด: Lng ${lngStr}, Lat ${latStr}`;

    const score = results.overall;
    this.elements.overallScoreText.textContent = score;
    
    let colorClass = 'score-good';
    if (score < 50) colorClass = 'score-poor';
    else if (score < 80) colorClass = 'score-moderate';

    this.elements.overallScoreCircle.className = `score-gauge-circle ${colorClass}`;

    // Helper for category bars
    const updateCategoryRow = (scoreVal, scoreBar, detailSpan, catData) => {
      const s = catData.score;
      scoreVal.textContent = `${s}/100`;
      scoreVal.className = `category-score-number ${s >= 80 ? 'text-good' : s >= 50 ? 'text-moderate' : 'text-poor'}`;
      
      scoreBar.style.width = `${s}%`;
      scoreBar.className = `progress-bar-fill ${s >= 80 ? 'bg-good' : s >= 50 ? 'bg-moderate' : 'bg-poor'}`;

      const d = catData.distanceKm;
      const distStr = d === Infinity ? 'ไม่มีโครงข่ายเชื่อมต่อ' : d >= 1 ? `${d.toFixed(2)} กม.` : `${Math.round(d * 1000)} ม.`;
      
      let walkTimeText = '';
      if (d !== Infinity && catData.durationSec !== undefined) {
        const mins = Math.max(1, Math.round(catData.durationSec / 60));
        const isSafety = detailSpan.id === 'score-safety-detail';
        const actionWord = isSafety ? 'ขับรถดับเพลิง' : 'เดิน';
        walkTimeText = ` (${actionWord} ~${mins} นาที)`;
      } else if (d !== Infinity) {
        const travelMins = Math.max(1, Math.round((d * 1000) / 80));
        walkTimeText = ` (เดิน ~${travelMins} นาที)`;
      }

      if (catData.nearestName) {
        detailSpan.innerHTML = `ใกล้ที่สุด: <b>${catData.nearestName}</b> - ${distStr}${walkTimeText}`;
      } else {
        detailSpan.innerHTML = `ใกล้ที่สุด: -`;
      }
    };

    updateCategoryRow(
      this.elements.transitScoreVal,
      this.elements.transitScoreBar,
      this.elements.transitDetail,
      results.categories.transit
    );

    updateCategoryRow(
      this.elements.parkScoreVal,
      this.elements.parkScoreBar,
      this.elements.parkDetail,
      results.categories.park
    );

    // Healthcare needs custom display for clinic vs hospital
    const hData = results.categories.health;
    const hScore = hData.score;
    this.elements.healthScoreVal.textContent = `${hScore}/100`;
    this.elements.healthScoreVal.className = `category-score-number ${hScore >= 80 ? 'text-good' : hScore >= 50 ? 'text-moderate' : 'text-poor'}`;
    this.elements.healthScoreBar.style.width = `${hScore}%`;
    this.elements.healthScoreBar.className = `progress-bar-fill ${hScore >= 80 ? 'bg-good' : hScore >= 50 ? 'bg-moderate' : 'bg-poor'}`;
    
    const hospDist = hData.distanceKm;
    const hospDistStr = hospDist === Infinity ? '-' : hospDist >= 1 ? `${hospDist.toFixed(2)} กม.` : `${Math.round(hospDist * 1000)} ม.`;
    this.elements.healthDetail.innerHTML = `
      โรงพยาบาล: <b>${hData.nearestHospitalName}</b> (${hospDistStr} ทางถนน)<br>
      คลินิกใกล้เคียง: <b>${hData.nearestClinicName}</b>
    `;

    // Safety
    const sData = results.categories.safety;
    updateCategoryRow(
      this.elements.safetyScoreVal,
      this.elements.safetyScoreBar,
      this.elements.safetyDetail,
      sData
    );

    // Flood Warning Card
    if (sData.floodDeduction > 0) {
      this.elements.floodWarningCard.style.display = 'block';
      this.elements.floodWarningCard.innerHTML = `
        <div class="warning-alert">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div>
            <b>แจ้งเตือนภัยคุกคาม:</b> อยู่ในพื้นที่เสี่ยงภัยน้ำท่วมขัง ${sData.floodRisk}<br>
            <span class="sub-alert-text">หักลบดัชนีความปลอดภัยทางโครงข่าย -${sData.floodDeduction} คะแนน</span>
          </div>
        </div>
      `;
    } else {
      this.elements.floodWarningCard.style.display = 'none';
    }
  }

  /**
   * Updates regional KPI stats on the UI.
   */
  updateRegionalStats(stats) {
    if (!stats) return;

    this.elements.kpiTotalPop.textContent = stats.totalPopulation.toLocaleString();
    this.elements.kpiTransitPct.textContent = `${stats.transitCoveredPct}%`;
    this.elements.kpiParkPct.textContent = `${stats.parkCoveredPct}%`;
    this.elements.kpiHealthPct.textContent = `${stats.healthCoveredPct}%`;
    this.elements.kpiSafetyPct.textContent = `${stats.safetyCoveredPct}%`;
    this.elements.kpiBlindPct.textContent = `${stats.blindSpotPct}%`;
    this.elements.kpiFullyPct.textContent = `${stats.fullyCoveredPct}%`;

    this.elements.kpiBlindPct.className = `kpi-value ${stats.blindSpotPct > 15 ? 'text-poor' : stats.blindSpotPct > 5 ? 'text-moderate' : 'text-good'}`;
    this.elements.kpiFullyPct.className = `kpi-value ${stats.fullyCoveredPct > 70 ? 'text-good' : stats.fullyCoveredPct > 45 ? 'text-moderate' : 'text-poor'}`;
  }
}
