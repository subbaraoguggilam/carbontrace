'use strict';

/**
 * carbonCalculator.js
 * Core emission calculation logic for CarbonTrace.
 *
 * All factors are expressed in kg CO2e per unit of activity.
 * Sources (publicly available, non-proprietary reference data):
 *  - EPA (2023) Emission Factors for Greenhouse Gas Inventories
 *  - IPCC AR6 (2021) Mitigation of Climate Change, Chapter 8 (Transport / AFOLU)
 *  - IEA (2023) CO2 Emissions from Fuel Combustion
 *  - Our World in Data, per-capita CO2 country comparisons
 *
 * NOTE: these are reasonable, widely-cited approximations for an
 * awareness/education tool. They are not a certified carbon audit.
 */

// ---------------------------------------------------------------------------
// Emission factors (kg CO2e per unit)
// ---------------------------------------------------------------------------

const TRANSPORT_FACTORS = {
  car_petrol: 0.192,           // per km, average petrol car (EPA 2023)
  car_electric: 0.053,         // per km, EV on average grid mix (IEA 2023)
  motorcycle: 0.103,           // per km
  bus: 0.089,                  // per km, per passenger
  train: 0.041,                // per km, per passenger
  flight_domestic: 0.255,      // per km, short-haul incl. radiative forcing index (IPCC)
  flight_international: 0.195, // per km, long-haul incl. radiative forcing index (IPCC)
};

const HOME_FACTORS = {
  electricity_kwh: 0.233,      // per kWh, grid average (IEA 2023)
  solar_kwh: 0.041,            // per kWh, lifecycle emissions of solar generation
  natural_gas_m3: 2.03,        // per cubic metre
  heating_oil_l: 2.96,         // per litre
};

// Diet presets: kg CO2e per day, based on IPCC AR6 dietary footprint ranges
const DIET_FACTORS = {
  vegan: 2.89,
  vegetarian: 3.81,
  pescatarian: 3.91,
  omnivore: 5.63,
  high_meat: 7.19,
};

// Per-kg factors for ad-hoc food logging (kept for extensibility)
const FOOD_ITEM_FACTORS = {
  beef: 27.0,
  lamb: 21.0,
  pork: 7.6,
  chicken: 4.9,
  fish: 4.1,
  dairy: 2.5,
  vegetables: 0.4,
  grains: 1.1,
};

const SHOPPING_FACTORS = {
  clothing_item: 8.4,          // per item, average garment lifecycle
  electronics_small: 45,       // per item, e.g. phone/accessory
  electronics_large: 320,      // per item, e.g. laptop/TV
  streaming_hour: 0.06,        // per hour, HD video streaming
};

const GLOBAL_AVG_ANNUAL_TONNES = 4.7;
const PARIS_TARGET_ANNUAL_TONNES = 2.0;
const WEEKS_PER_YEAR = 52;

// Recommendation-engine assumption constants (named so the reasoning behind
// each estimate is explicit rather than a bare multiplier in the logic below).
const SOLAR_OFFSET_FEASIBILITY = 0.3;        // assume 30% of grid usage can realistically shift to renewables
const FLIGHT_REDUCTION_FACTOR = 0.5;         // assume half of flights can be avoided or combined
const ELECTRONICS_LIFESPAN_EXTENSION = 0.5;  // assume repair/extension avoids ~50% of replacement footprint
const MEAT_SWAP_DAYS_PER_WEEK = 2;           // assume 2 days/week swapped to a lower-impact diet

// ---------------------------------------------------------------------------
// Category calculators
// ---------------------------------------------------------------------------

/**
 * Generic category calculator: sums whitelisted activity values against
 * their emission factors. Shared by transport, home, and shopping, which
 * all have the same "flat map of activity -> factor" shape.
 * @param {object} input - whitelisted weekly activity by key
 * @param {object} factors - emission factors keyed the same way as input
 * @returns {{total: number, breakdown: object}}
 */
function calculateCategory(input = {}, factors) {
  const breakdown = {};
  let total = 0;
  for (const [key, value] of Object.entries(input)) {
    const factor = factors[key];
    if (factor === undefined) continue;
    const kg = factor * value;
    breakdown[key] = round2(kg);
    total += kg;
  }
  return { total: round2(total), breakdown };
}

/**
 * @param {object} transport - whitelisted weekly transport activity by mode
 * @returns {{total: number, breakdown: object}}
 */
function calculateTransport(transport = {}) {
  return calculateCategory(transport, TRANSPORT_FACTORS);
}

/**
 * @param {object} home - whitelisted weekly home-energy activity
 * @returns {{total: number, breakdown: object}}
 */
function calculateHome(home = {}) {
  return calculateCategory(home, HOME_FACTORS);
}

/**
 * @param {object} food - { diet: string, days: number }
 * @returns {{total: number, breakdown: object}}
 */
function calculateFood(food = {}) {
  const diet = DIET_FACTORS[food.diet] !== undefined ? food.diet : 'omnivore';
  const days = typeof food.days === 'number' && food.days > 0 ? food.days : 7;
  const dailyFactor = DIET_FACTORS[diet];
  const total = dailyFactor * days;
  return {
    total: round2(total),
    breakdown: { diet, days, daily_factor: dailyFactor },
  };
}

/**
 * @param {object} shopping - whitelisted weekly shopping/consumption activity
 * @returns {{total: number, breakdown: object}}
 */
function calculateShopping(shopping = {}) {
  return calculateCategory(shopping, SHOPPING_FACTORS);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Calculates total weekly footprint across all categories and annualises it.
 * @param {object} input - { transport, home, food, shopping } (all weekly except food.days)
 */
function calculateTotalFootprint(input = {}) {
  const transport = calculateTransport(input.transport);
  const home = calculateHome(input.home);
  const food = calculateFood(input.food);
  const shopping = calculateShopping(input.shopping);

  // Transport/home/shopping inputs are weekly; food covers `days` days.
  // Scale each category to an annual figure explicitly.
  const transportAnnual = transport.total * WEEKS_PER_YEAR;
  const homeAnnual = home.total * WEEKS_PER_YEAR;
  const shoppingAnnual = shopping.total * WEEKS_PER_YEAR;
  const foodAnnual = food.breakdown.days > 0
    ? (food.total / food.breakdown.days) * 365
    : food.total * 365 / 7;

  const total_kg = round2(transportAnnual + homeAnnual + foodAnnual + shoppingAnnual);
  const total_tonnes = round4(total_kg / 1000);

  const categories = {
    transport: { kg: round2(transportAnnual), breakdown: transport.breakdown },
    home: { kg: round2(homeAnnual), breakdown: home.breakdown },
    food: { kg: round2(foodAnnual), breakdown: food.breakdown },
    shopping: { kg: round2(shoppingAnnual), breakdown: shopping.breakdown },
  };

  const comparison = {
    vs_global_avg: round1((total_tonnes / GLOBAL_AVG_ANNUAL_TONNES) * 100),
    vs_paris_target: round1((total_tonnes / PARIS_TARGET_ANNUAL_TONNES) * 100),
  };

  return {
    total_kg,
    total_tonnes,
    categories,
    comparison,
  };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

/**
 * Generates personalised, impact-sorted recommendations based on the
 * categories that contribute most to the user's footprint.
 */
function generateRecommendations(input = {}, footprint) {
  const recs = [];
  const { categories } = footprint;

  if (input.transport && input.transport.car_petrol > 0) {
    const weeklyKm = input.transport.car_petrol;
    const switchSavingPerYear = round2(
      weeklyKm * WEEKS_PER_YEAR * (TRANSPORT_FACTORS.car_petrol - TRANSPORT_FACTORS.train)
    );
    if (switchSavingPerYear > 0) {
      recs.push({
        category: 'transport',
        action: 'Replace some petrol car trips with train or bus where possible',
        impact_kg_per_year: switchSavingPerYear,
        difficulty: 'medium',
        cost_saving: true,
      });
    }
  }

  if (input.food) {
    const diet = DIET_FACTORS[input.food.diet] !== undefined ? input.food.diet : 'omnivore';
    if (diet === 'high_meat' || diet === 'omnivore') {
      const lowerDiet = diet === 'high_meat' ? 'omnivore' : 'pescatarian';
      const dailySaving = DIET_FACTORS[diet] - DIET_FACTORS[lowerDiet];
      recs.push({
        category: 'food',
        action: 'Replace red meat with chicken or plant proteins a few times a week',
        impact_kg_per_year: round2(dailySaving * MEAT_SWAP_DAYS_PER_WEEK * WEEKS_PER_YEAR),
        difficulty: 'easy',
        cost_saving: true,
      });
    }
  }

  if (input.home && input.home.electricity_kwh > 0 && !(input.home.solar_kwh > 0)) {
    const weeklyKwh = input.home.electricity_kwh;
    const saving = round2(
      weeklyKwh * WEEKS_PER_YEAR * (HOME_FACTORS.electricity_kwh - HOME_FACTORS.solar_kwh) * SOLAR_OFFSET_FEASIBILITY
    );
    recs.push({
      category: 'home',
      action: 'Switch to a renewable energy tariff or supplement with solar where available',
      impact_kg_per_year: saving,
      difficulty: 'medium',
      cost_saving: false,
    });
  }

  if (input.transport && (input.transport.flight_domestic > 0 || input.transport.flight_international > 0)) {
    recs.push({
      category: 'transport',
      action: 'Combine trips or choose rail alternatives for short-haul journeys when possible',
      impact_kg_per_year: round2(
        ((input.transport.flight_domestic || 0) + (input.transport.flight_international || 0)) *
          WEEKS_PER_YEAR *
          FLIGHT_REDUCTION_FACTOR
      ),
      difficulty: 'hard',
      cost_saving: true,
    });
  }

  if (input.shopping && (input.shopping.electronics_large > 0 || input.shopping.electronics_small > 0)) {
    recs.push({
      category: 'shopping',
      action: 'Extend device lifespan by repairing instead of replacing electronics',
      impact_kg_per_year: round2(
        ((input.shopping.electronics_large || 0) * SHOPPING_FACTORS.electronics_large +
          (input.shopping.electronics_small || 0) * SHOPPING_FACTORS.electronics_small) *
          WEEKS_PER_YEAR *
          ELECTRONICS_LIFESPAN_EXTENSION
      ),
      difficulty: 'easy',
      cost_saving: true,
    });
  }

  // Always include at least one general tip so the list is never empty.
  if (recs.length === 0) {
    recs.push({
      category: 'general',
      action: 'Your footprint is already efficient — track monthly to maintain it',
      impact_kg_per_year: 0,
      difficulty: 'easy',
      cost_saving: false,
    });
  }

  return recs
    .filter((r) => r.impact_kg_per_year >= 0)
    .sort((a, b) => b.impact_kg_per_year - a.impact_kg_per_year);
}

// ---------------------------------------------------------------------------
// Equivalencies
// ---------------------------------------------------------------------------

const TREE_ABSORPTION_KG_PER_YEAR = 21; // average mature tree, kg CO2/year
const CAR_KM_FACTOR = TRANSPORT_FACTORS.car_petrol;
const PHONE_CHARGE_KG = 0.0084; // kg CO2 per full smartphone charge
const BEEF_BURGER_KG = 3.0;     // kg CO2e per average beef burger (patty)
const STREAMING_HOUR_KG = SHOPPING_FACTORS.streaming_hour; // kg CO2e per hour HD streaming

/**
 * @param {number} kg - annual kg CO2e value
 */
function calculateEquivalencies(kg) {
  if (typeof kg !== 'number' || kg < 0 || !isFinite(kg)) {
    throw new RangeError('kg must be a non-negative finite number');
  }
  return {
    trees_to_offset_annual: Math.round(kg / TREE_ABSORPTION_KG_PER_YEAR),
    km_driving_equivalent: Math.round(kg / CAR_KM_FACTOR),
    smartphone_charges: Math.round(kg / PHONE_CHARGE_KG),
    beef_burgers_equivalent: Math.round(kg / BEEF_BURGER_KG),
    hours_of_streaming: Math.round(kg / STREAMING_HOUR_KG),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = {
  TRANSPORT_FACTORS,
  HOME_FACTORS,
  DIET_FACTORS,
  FOOD_ITEM_FACTORS,
  SHOPPING_FACTORS,
  GLOBAL_AVG_ANNUAL_TONNES,
  PARIS_TARGET_ANNUAL_TONNES,
  calculateTransport,
  calculateHome,
  calculateFood,
  calculateShopping,
  calculateTotalFootprint,
  generateRecommendations,
  calculateEquivalencies,
};
