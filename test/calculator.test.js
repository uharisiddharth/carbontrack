import test from "node:test";
import assert from "node:assert";

// Mock the formulas exactly as implemented in netlify/functions/api.ts
function calculateCarbonEmissions(inputs) {
  const distance = parseFloat(inputs.transportDistance) || 0;
  const vehicle = inputs.transportType || "none";
  const electricity = parseFloat(inputs.electricity) || 0;
  const gas = parseFloat(inputs.gas) || 0;
  const diet = inputs.diet || "med_meat";
  const waste = inputs.waste || "med";

  // Transport calculation (annual kg CO2e)
  let transportCoefficients = {
    gas: 0.24,
    hybrid: 0.12,
    electric: 0.05,
    transit: 0.04,
    none: 0,
  };
  const transEmissions = distance * (transportCoefficients[vehicle] ?? 0);

  // Energy calculation (annual kg CO2e)
  const energyEmissions = (electricity * 0.38 + gas * 0.18) * 12;

  // Diet calculation (annual kg CO2e constants)
  let dietConstants = {
    high_meat: 2630,
    med_meat: 1750,
    veg: 880,
    vegan: 550,
  };
  const foodEmissions = dietConstants[diet] ?? 1750;

  // Waste calculation (annual kg CO2e constants)
  let wasteConstants = {
    high: 550,
    med: 290,
    low: 110,
  };
  const wasteEmissions = wasteConstants[waste] ?? 290;

  const totalEmissions = transEmissions + energyEmissions + foodEmissions + wasteEmissions;

  return {
    transEmissions,
    energyEmissions,
    foodEmissions,
    wasteEmissions,
    totalEmissions
  };
}

test("Carbon Footprint Calculator Formulas", async (t) => {
  await t.test("should correctly calculate average mixed emissions", () => {
    const inputs = {
      transportType: "hybrid",
      transportDistance: "12000",
      electricity: "350",
      gas: "150",
      diet: "med_meat",
      waste: "med"
    };

    const results = calculateCarbonEmissions(inputs);

    // Transport: 12000 * 0.12 = 1440 kg CO2e
    assert.strictEqual(results.transEmissions, 1440);

    // Energy: (350 * 0.38 + 150 * 0.18) * 12 = (133 + 27) * 12 = 160 * 12 = 1920 kg CO2e
    assert.strictEqual(results.energyEmissions, 1920);

    // Food: med_meat = 1750 kg CO2e
    assert.strictEqual(results.foodEmissions, 1750);

    // Waste: med = 290 kg CO2e
    assert.strictEqual(results.wasteEmissions, 290);

    // Total: 1440 + 1920 + 1750 + 290 = 5400 kg CO2e
    assert.strictEqual(results.totalEmissions, 5400);
  });

  await t.test("should correctly calculate extreme low vegan emissions", () => {
    const inputs = {
      transportType: "none",
      transportDistance: "0",
      electricity: "50",
      gas: "0",
      diet: "vegan",
      waste: "low"
    };

    const results = calculateCarbonEmissions(inputs);

    // Transport: 0
    assert.strictEqual(results.transEmissions, 0);

    // Energy: (50 * 0.38 + 0 * 0.18) * 12 = 19 * 12 = 228
    assert.strictEqual(results.energyEmissions, 228);

    // Food: vegan = 550
    assert.strictEqual(results.foodEmissions, 550);

    // Waste: low = 110
    assert.strictEqual(results.wasteEmissions, 110);

    // Total: 0 + 228 + 550 + 110 = 888 kg CO2e
    assert.strictEqual(results.totalEmissions, 888);
  });

  await t.test("should handle missing inputs gracefully with defaults", () => {
    const inputs = {};
    const results = calculateCarbonEmissions(inputs);

    assert.strictEqual(results.transEmissions, 0);
    assert.strictEqual(results.energyEmissions, 0);
    assert.strictEqual(results.foodEmissions, 1750); // Default to med_meat
    assert.strictEqual(results.wasteEmissions, 290); // Default to med
    assert.strictEqual(results.totalEmissions, 2040);
  });
});
