import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// Chart typography and style constants
const FONT_FAMILY = "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const TEXT_COLOR = '#a3a3a3'; // neutral-400
const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';

/**
 * Initializes the Radar Chart for Accessibility Score Card.
 * @param {HTMLCanvasElement} canvas - The canvas element to render into.
 * @returns {Chart} Chart.js instance.
 */
export function initRadarChart(canvas) {
  return new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['🚌 ขนส่งสาธารณะ', '🌳 พื้นที่สีเขียว', '🏥 สาธารณสุข', '🚨 ความปลอดภัย'],
      datasets: [{
        label: 'ดัชนีการเข้าถึง (Access Score)',
        data: [0, 0, 0, 0],
        backgroundColor: 'rgba(99, 102, 241, 0.2)', // indigo-500 with opacity
        borderColor: 'rgba(99, 102, 241, 0.8)', // indigo-500
        borderWidth: 2,
        pointBackgroundColor: 'rgba(129, 140, 248, 1)', // indigo-400
        pointBorderColor: '#0f172a', // slate-900
        pointBorderWidth: 2,
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(99, 102, 241, 1)',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#1e293b', // slate-800
          titleFont: { family: FONT_FAMILY, size: 13, weight: 'bold' },
          bodyFont: { family: FONT_FAMILY, size: 12 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return `คะแนน: ${context.parsed.r} / 100`;
            }
          }
        }
      },
      scales: {
        r: {
          angleLines: {
            color: GRID_COLOR
          },
          grid: {
            color: GRID_COLOR
          },
          pointLabels: {
            color: '#e2e8f0', // slate-200
            font: {
              family: FONT_FAMILY,
              size: 11,
              weight: '500'
            }
          },
          ticks: {
            backdropColor: 'transparent',
            color: TEXT_COLOR,
            font: {
              family: FONT_FAMILY,
              size: 9
            },
            stepSize: 20,
            showLabelBackdrop: false
          },
          min: 0,
          max: 100
        }
      }
    }
  });
}

/**
 * Updates the Radar Chart data.
 * @param {Chart} chart - Radar chart instance.
 * @param {Object} scores - Access score results.
 */
export function updateRadarChart(chart, scores) {
  chart.data.datasets[0].data = [
    scores.transit.score,
    scores.park.score,
    scores.health.score,
    scores.safety.score
  ];
  
  // Dynamic color coding based on overall score
  const avg = (scores.transit.score + scores.park.score + scores.health.score + scores.safety.score) / 4;
  let color = 'rgba(99, 102, 241, 0.8)'; // default indigo
  let bgColor = 'rgba(99, 102, 241, 0.2)';
  
  if (avg >= 80) {
    color = 'rgba(16, 185, 129, 0.85)'; // emerald-500
    bgColor = 'rgba(16, 185, 129, 0.15)';
  } else if (avg < 50) {
    color = 'rgba(239, 68, 68, 0.85)'; // red-500
    bgColor = 'rgba(239, 68, 68, 0.15)';
  }
  
  chart.data.datasets[0].borderColor = color;
  chart.data.datasets[0].backgroundColor = bgColor;
  chart.data.datasets[0].pointHoverBorderColor = color;
  
  chart.update();
}

/**
 * Initializes the Bar Chart for Regional Service Coverage.
 * @param {HTMLCanvasElement} canvas - The canvas element.
 * @returns {Chart} Chart.js instance.
 */
export function initRegionalChart(canvas) {
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['ขนส่งสาธารณะ', 'พื้นที่สีเขียว', 'สาธารณสุข', 'ความปลอดภัย'],
      datasets: [{
        label: 'สัดส่วนประชากรที่เข้าถึงได้ (%)',
        data: [0, 0, 0, 0],
        backgroundColor: [
          'rgba(59, 130, 246, 0.55)',  // blue-500
          'rgba(16, 185, 129, 0.55)',  // emerald-500
          'rgba(236, 72, 153, 0.55)',  // pink-500
          'rgba(249, 115, 22, 0.55)'   // orange-500
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(236, 72, 153)',
          'rgb(249, 115, 22)'
        ],
        borderWidth: 1.5,
        borderRadius: 4,
        barPercentage: 0.55
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleFont: { family: FONT_FAMILY, size: 12, weight: 'bold' },
          bodyFont: { family: FONT_FAMILY, size: 11 },
          padding: 8,
          callbacks: {
            label: function(context) {
              return `เข้าถึงได้: ${context.parsed.y}% ของประชากร`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: TEXT_COLOR,
            font: { family: FONT_FAMILY, size: 10 }
          }
        },
        y: {
          grid: {
            color: GRID_COLOR
          },
          ticks: {
            color: TEXT_COLOR,
            font: { family: FONT_FAMILY, size: 9 },
            stepSize: 20
          },
          min: 0,
          max: 100
        }
      }
    }
  });
}

/**
 * Updates the Regional Coverage Chart.
 * @param {Chart} chart - Bar chart instance.
 * @param {Object} stats - Calculated coverage statistics.
 */
export function updateRegionalChart(chart, stats) {
  chart.data.datasets[0].data = [
    stats.transitCoveredPct,
    stats.parkCoveredPct,
    stats.healthCoveredPct,
    stats.safetyCoveredPct
  ];
  chart.update();
}
