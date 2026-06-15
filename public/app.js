// Custom SPA Controller: Carbon Tracker State and API Coordinator

// Global Config
const API_BASE = ""; // Relative routes target Netlify Functions directly

// Default Habit actions metadata
const STATIC_HABITS = [
  {
    id: "eat_vegan_meals",
    title: "Eat Plant-Based Meal",
    category: "food",
    emoji: "🥗",
    savings: 1.5,
    desc: "Bypassing meat and dairy for a single meal reduces high-intensity agricultural emissions."
  },
  {
    id: "public_transit",
    title: "Use Active/Transit Commute",
    category: "transport",
    emoji: "🚲",
    savings: 4.0,
    desc: "Commuting via public transit, walking, or cycling instead of single-occupancy driving saves significant fossil fuels."
  },
  {
    id: "line_dry",
    title: "Line-Dry Clothes",
    category: "energy",
    emoji: "👕",
    savings: 1.8,
    desc: "Air-drying standard laundry loads prevents high-wattage electric clothes dryer cycles."
  },
  {
    id: "idle_electronics",
    title: "Unplug Standby Devices",
    category: "energy",
    emoji: "🔌",
    savings: 0.2,
    desc: "Standby electronics and household appliances draw constant 'vampire' currents when not in use."
  },
  {
    id: "adjust_thermostat",
    title: "Adjust Thermostat 1-2°C",
    category: "energy",
    emoji: "🌡️",
    savings: 1.2,
    desc: "Slightly easing heating or cooling thresholds reduces seasonal natural gas and electric loads."
  },
  {
    id: "cold_water_wash",
    title: "Wash Clothes on Cold",
    category: "energy",
    emoji: "🧼",
    savings: 0.5,
    desc: "Most energy consumed during laundry is spent heating water. Cold water preserves fabrics and prevents emissions."
  },
  {
    id: "compost_composting",
    title: "Compost Organic Waste",
    category: "waste",
    emoji: "🍎",
    savings: 0.4,
    desc: "Composting food waste avoids landfill methane emissions by letting organic material decay aerobically."
  }
];

// App State Core
let state = {
  token: "",
  user: null,
  logs: [],
  actions: [],
  currentStep: 1,
};

// --- Initialization & Token Generation ---
function initSession() {
  let storedToken = localStorage.getItem("carbon_tracker_token");
  if (!storedToken) {
    // Generate a unique 8-character token
    storedToken = "usr_" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("carbon_tracker_token", storedToken);
  }
  state.token = storedToken;
  document.getElementById("session-token-display").textContent = `#${storedToken}`;
}

// --- API Sync Helpers ---
async function fetchUserData() {
  try {
    const res = await fetch(`${API_BASE}/api/user?token=${state.token}`);
    if (!res.ok) throw new Error("Failed to load user profile");
    
    const data = await res.json();
    state.user = data.user;
    state.logs = data.logs || [];
    state.actions = data.actions || [];
    
    updateUI();
  } catch (err) {
    console.error("Error fetching user data:", err);
  }
}

async function updateUserName(newName) {
  try {
    const res = await fetch(`${API_BASE}/api/user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token, name: newName })
    });
    if (res.ok) {
      const data = await res.json();
      state.user = data.user;
    }
  } catch (err) {
    console.error("Error saving username:", err);
  }
}

async function submitCalculation(inputs) {
  try {
    const res = await fetch(`${API_BASE}/api/calculator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token, inputs })
    });
    if (!res.ok) throw new Error("Calculation failure");
    
    const data = await res.json();
    
    // Add new log to head
    state.logs.unshift(data.log);
    
    // Update insights and display
    document.getElementById("insight-text").textContent = data.insight;
    
    // Refresh fully
    await fetchUserData();
    
    // Close Modal
    closeCalculator();
  } catch (err) {
    alert("Could not process carbon footprint. Please try again.");
    console.error(err);
  }
}

async function toggleCommitment(actionId, commit) {
  try {
    if (commit) {
      // Commit as To-Do
      const res = await fetch(`${API_BASE}/api/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: state.token, actionId, status: "todo", savedCo2: getSavingsForId(actionId) })
      });
      if (res.ok) await fetchUserData();
    } else {
      // Remove Commitment
      const res = await fetch(`${API_BASE}/api/actions?token=${state.token}&actionId=${actionId}&status=todo`, {
        method: "DELETE"
      });
      if (res.ok) await fetchUserData();
    }
  } catch (err) {
    console.error(err);
  }
}

async function logCompletion(actionId) {
  try {
    const res = await fetch(`${API_BASE}/api/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token, actionId, status: "completed", savedCo2: getSavingsForId(actionId) })
    });
    if (res.ok) {
      // Small completion visual effect if possible
      await fetchUserData();
    }
  } catch (err) {
    console.error(err);
  }
}

function getSavingsForId(id) {
  const h = STATIC_HABITS.find(item => item.id === id);
  return h ? h.savings : 0;
}

// --- Dynamic Visual Updates ---
function updateUI() {
  if (!state.user) return;
  
  // Set name
  document.getElementById("user-name-input").value = state.user.name || "Eco Explorer";
  
  // Current footprint
  const currentLog = state.logs[0];
  const totalCo2 = currentLog ? Math.round(currentLog.totalEmissions) : 0;
  document.getElementById("total-co2-display").textContent = totalCo2.toLocaleString();
  
  const tonsVal = (totalCo2 / 1000).toFixed(1);
  document.getElementById("user-footprint-val").textContent = `${tonsVal} t`;
  
  // Set Radial Score Meter Arc
  // Circumference of r=70 circle is 2 * PI * 70 = 439.8 (approx 440)
  const scoreRadial = document.getElementById("score-radial-bar");
  if (scoreRadial) {
    const maxReference = 15000; // 15 tons as max ceiling scale
    const rawPct = currentLog ? totalCo2 / maxReference : 0;
    const boundedPct = Math.min(Math.max(rawPct, 0), 1);
    const dashOffset = 440 - (boundedPct * 440);
    scoreRadial.style.strokeDashoffset = dashOffset;
    
    // Change color based on emission level
    if (totalCo2 > 10000) {
      scoreRadial.style.stroke = "#ef4444"; // high emissions: red
    } else if (totalCo2 > 5000) {
      scoreRadial.style.stroke = "#f59e0b"; // moderate: orange
    } else {
      scoreRadial.style.stroke = "#22c55e"; // low/optimal: green
    }
  }

  // Update Comparison Feedback
  const feedbackEl = document.getElementById("comparison-feedback");
  if (currentLog) {
    if (totalCo2 < 2000) {
      feedbackEl.innerHTML = "🎉 Excellent! Your footprint is in line with the **global 2030 climate target**.";
    } else if (totalCo2 < 4800) {
      feedbackEl.innerHTML = "👍 Good! You are **below the global average** footprint of 4.8 tons. Keep it up!";
    } else {
      feedbackEl.innerHTML = "⚠️ Your footprint is **above the global average**. Focus on your highest category below to trim it.";
    }
  }

  // Categories Emissions Breakdown Chart (Donut)
  if (currentLog) {
    const trans = currentLog.transportEmissions || 0;
    const energy = currentLog.energyEmissions || 0;
    const food = currentLog.foodEmissions || 0;
    const waste = currentLog.wasteEmissions || 0;
    const sum = trans + energy + food + waste;

    if (sum > 0) {
      const transPct = Math.round((trans / sum) * 100);
      const energyPct = Math.round((energy / sum) * 100);
      const foodPct = Math.round((food / sum) * 100);
      const wastePct = Math.round((waste / sum) * 100);

      // Render Custom SVG Donut wedges
      renderDonutChart(trans, energy, food, waste, sum);

      // Render Legend
      document.getElementById("chart-legend").innerHTML = `
        <div class="legend-item"><span class="color-dot transport"></span> Transport: ${transPct}%</div>
        <div class="legend-item"><span class="color-dot energy"></span> Home Energy: ${energyPct}%</div>
        <div class="legend-item"><span class="color-dot food"></span> Diet: ${foodPct}%</div>
        <div class="legend-item"><span class="color-dot waste"></span> Waste: ${wastePct}%</div>
      `;
    }
  }

  // Gamification Metrics (Level calculation)
  const completedActions = state.actions.filter(a => a.status === "completed");
  const totalSaved = completedActions.reduce((acc, curr) => acc + curr.savedCo2, 0);
  document.getElementById("total-saved-co2").textContent = totalSaved.toFixed(1);
  
  const activeTodos = state.actions.filter(a => a.status === "todo");
  document.getElementById("active-goals-count").textContent = activeTodos.length;

  // Level logic: 1 level per 5 completions
  const userLevel = 1 + Math.floor(completedActions.length / 5);
  document.getElementById("user-level").textContent = userLevel;

  // Populate Actions Habit Grid
  renderHabitsBoard();

  // Populate History Table
  const tableBody = document.getElementById("history-table-body");
  if (state.logs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="empty-state">No historical logs found. Calculate your footprint above to start.</td></tr>`;
  } else {
    tableBody.innerHTML = state.logs.map(log => {
      const date = new Date(log.loggedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      return `
        <tr>
          <td>${date}</td>
          <td>${Math.round(log.transportEmissions).toLocaleString()} kg</td>
          <td>${Math.round(log.energyEmissions).toLocaleString()} kg</td>
          <td>${Math.round(log.foodEmissions).toLocaleString()} kg</td>
          <td>${Math.round(log.wasteEmissions).toLocaleString()} kg</td>
          <td class="total-val">${Math.round(log.totalEmissions).toLocaleString()} kg</td>
        </tr>
      `;
    }).join("");
  }
}

// Programmatic Donut Chart Generator using SVG stroke-dasharray
function renderDonutChart(trans, energy, food, waste, total) {
  const r = 40;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r; // 251.3
  
  const values = [
    { name: "transport", val: trans, color: "var(--color-transport)" },
    { name: "energy", val: energy, color: "var(--color-energy)" },
    { name: "food", val: food, color: "var(--color-food)" },
    { name: "waste", val: waste, color: "var(--color-waste)" }
  ];

  let svgContent = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="#f1f5f9" stroke-width="12"></circle>`;
  let accumulatedAngle = 0;

  values.forEach(item => {
    if (item.val <= 0) return;
    const ratio = item.val / total;
    const strokeDash = ratio * circumference;
    const strokeOffset = circumference - strokeDash + accumulatedAngle;
    
    // To rotate correctly, we apply inline transform styles
    svgContent += `
      <circle cx="${cx}" cy="${cy}" r="${r}" 
              fill="transparent" 
              stroke="${item.color}" 
              stroke-width="14" 
              stroke-dasharray="${circumference}" 
              stroke-dashoffset="${strokeOffset}"
              transform="rotate(-90 ${cx} ${cy})"
              style="transition: stroke-dashoffset 0.5s ease-out;" />
    `;
    accumulatedAngle -= strokeDash;
  });

  document.getElementById("donut-svg").innerHTML = svgContent;
}

// Habits Grid Generator
function renderHabitsBoard() {
  const habitsGrid = document.getElementById("habits-grid");
  const todos = state.actions.filter(a => a.status === "todo");
  
  habitsGrid.innerHTML = STATIC_HABITS.map(habit => {
    const isTodo = todos.some(t => t.actionId === habit.id);
    const cardClass = isTodo ? "habit-card active-todo" : "habit-card";
    
    // Completion count for this habit
    const completionCount = state.actions.filter(a => a.actionId === habit.id && a.status === "completed").length;
    const completionBadge = completionCount > 0 ? `<span class="completion-count" style="font-size: 11px; background: var(--color-green-mid); color: white; padding: 2px 6px; border-radius: 99px; font-weight:700;">✓ ${completionCount} logged</span>` : "";

    return `
      <div class="${cardClass}">
        <div>
          <div class="habit-header">
            <span class="habit-icon">${habit.emoji}</span>
            <div class="habit-title-box">
              <h3>${habit.title}</h3>
              <span class="habit-category-badge ${habit.category}">${habit.category}</span>
            </div>
          </div>
          <p class="habit-desc">${habit.desc}</p>
        </div>
        
        <div>
          <div class="habit-savings">
            <div><strong>-${habit.savings.toFixed(1)}</strong> kg CO2e</div>
            <span>per completion</span>
          </div>
          
          <div class="habit-footer-buttons">
            ${isTodo ? `
              <button class="btn btn-outline-cancel" onclick="handleCommit('${habit.id}', false)" title="Remove from active commitments">Remove</button>
              <button class="btn btn-action-done" onclick="handleLogComplete('${habit.id}')" title="Log completing this habit today">Log Done</button>
            ` : `
              <button class="btn btn-secondary" onclick="handleCommit('${habit.id}', true)">Add to To-Do</button>
              <button class="btn btn-primary" onclick="handleLogComplete('${habit.id}')">Quick Log</button>
            `}
          </div>
          <div style="display:flex; justify-content: flex-end; margin-top: 8px;">
            ${completionBadge}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// Expose actions to window context for simplified element bindings
window.handleCommit = async function(id, commit) {
  await toggleCommitment(id, commit);
};

window.handleLogComplete = async function(id) {
  await logCompletion(id);
};

// --- Modal Control Functions ---
function openCalculator() {
  state.currentStep = 1;
  updateFormSteps();
  document.getElementById("calculator-modal").classList.add("open");
}

function closeCalculator() {
  document.getElementById("calculator-modal").classList.remove("open");
}

function updateFormSteps() {
  // Show active step
  document.querySelectorAll(".form-step").forEach((el, index) => {
    if (index === state.currentStep - 1) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  // Show active tab indicator
  document.querySelectorAll(".step-dot").forEach((el, index) => {
    if (index === state.currentStep - 1) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  // Configure Button states
  const prevBtn = document.getElementById("calc-prev-btn");
  const nextBtn = document.getElementById("calc-next-btn");

  if (state.currentStep === 1) {
    prevBtn.disabled = true;
  } else {
    prevBtn.disabled = false;
  }

  if (state.currentStep === 4) {
    nextBtn.textContent = "Finish & Calculate";
  } else {
    nextBtn.textContent = "Next Step";
  }
}

// --- Form Inputs Listeners ---
function bindFormInputs() {
  // Transport distance range synchronizer
  const distRange = document.getElementById("transportDistance");
  const distVal = document.getElementById("distance-val");
  distRange.addEventListener("input", () => {
    distVal.textContent = parseFloat(distRange.value).toLocaleString();
  });

  // Electricity monthly consumption synchronizer
  const elecRange = document.getElementById("electricity");
  const elecVal = document.getElementById("electricity-val");
  elecRange.addEventListener("input", () => {
    elecVal.textContent = parseFloat(elecRange.value).toLocaleString();
  });

  // Natural Gas monthly consumption synchronizer
  const gasRange = document.getElementById("gas");
  const gasVal = document.getElementById("gas-val");
  gasRange.addEventListener("input", () => {
    gasVal.textContent = parseFloat(gasRange.value).toLocaleString();
  });

  // Auto handle radio button stylized select effects
  document.querySelectorAll(".radio-card input").forEach(radio => {
    radio.addEventListener("change", (e) => {
      // Uncheck all siblings
      const cardGrid = e.target.closest(".radio-card-grid");
      cardGrid.querySelectorAll(".radio-card").forEach(c => c.classList.remove("checked"));
      
      // Check current
      e.target.closest(".radio-card").classList.add("checked");
    });
  });
}

// --- DOM Event Bindings ---
document.addEventListener("DOMContentLoaded", () => {
  initSession();
  bindFormInputs();
  
  // Dashboard Recalculate button trigger
  document.getElementById("open-calc-btn").addEventListener("click", openCalculator);
  
  // Calculator closing handles
  document.getElementById("close-calc-btn").addEventListener("click", closeCalculator);
  
  // Modal background backdrop click dismiss
  document.getElementById("calculator-modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("calculator-modal")) {
      closeCalculator();
    }
  });

  // Step Nav Prev
  document.getElementById("calc-prev-btn").addEventListener("click", () => {
    if (state.currentStep > 1) {
      state.currentStep--;
      updateFormSteps();
    }
  });

  // Step Nav Next or Submit
  document.getElementById("calc-next-btn").addEventListener("click", () => {
    if (state.currentStep < 4) {
      state.currentStep++;
      updateFormSteps();
    } else {
      // Process submission
      const form = document.getElementById("calc-form");
      const formData = new FormData(form);
      const inputs = {
        transportType: formData.get("transportType"),
        transportDistance: formData.get("transportDistance"),
        electricity: formData.get("electricity"),
        gas: formData.get("gas"),
        diet: formData.get("diet"),
        waste: formData.get("waste"),
      };
      
      submitCalculation(inputs);
    }
  });

  // Username auto-saver on blur or enter key
  const nameInput = document.getElementById("user-name-input");
  nameInput.addEventListener("blur", () => {
    if (nameInput.value.trim() && state.user && nameInput.value !== state.user.name) {
      updateUserName(nameInput.value.trim());
    }
  });
  nameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      nameInput.blur();
    }
  });

  // Fetch initial user session profile details
  fetchUserData();
});
