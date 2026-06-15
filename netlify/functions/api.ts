import type { Config, Context } from "@netlify/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getConnectionString } from "@netlify/database";
import { eq, and, desc } from "drizzle-orm";
import * as schema from "../../db/schema";

let pool: pg.Pool | null = null;
let db: any = null;

// Initialize the Database Connection Pool
function getDb() {
  if (!pool) {
    const connectionString = getConnectionString();
    if (!connectionString) {
      throw new Error("Netlify Database connection string is not available. Please verify Netlify Database setup.");
    }
    pool = new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    db = drizzle(pool, { schema });
  }
  return db;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Content-Type": "application/json",
};

export default async (req: Request, context: Context) => {
  // Handle OPTIONS preflight requests for CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  try {
    const database = getDb();

    // 1. GET /api/user - Fetch or create user profiles
    if (path === "/api/user" && method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ error: "Token parameter is required" }), { status: 400, headers: corsHeaders });
      }

      // Check if user exists
      let userResults = await database.select().from(schema.users)
        .where(eq(schema.users.sessionToken, token))
        .limit(1);
      let user = userResults[0];

      if (!user) {
        // Auto-create new anonymous user session
        const inserted = await database.insert(schema.users).values({
          sessionToken: token,
          name: "Eco Explorer",
        }).returning();
        user = inserted[0];
      }

      // Fetch recent footprint logs
      const logs = await database.select().from(schema.footprintLogs)
        .where(eq(schema.footprintLogs.userId, user.id))
        .orderBy(desc(schema.footprintLogs.loggedAt))
        .limit(10);

      // Fetch user goals/actions
      const actions = await database.select().from(schema.userActions)
        .where(eq(schema.userActions.userId, user.id))
        .orderBy(desc(schema.userActions.completedAt));

      return new Response(JSON.stringify({ user, logs, actions }), { status: 200, headers: corsHeaders });
    }

    // 2. POST /api/user - Update profile details
    if (path === "/api/user" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { token, name } = body;

      if (!token || !name) {
        return new Response(JSON.stringify({ error: "Token and name are required" }), { status: 400, headers: corsHeaders });
      }

      // Verify user exists
      const userResults = await database.select().from(schema.users)
        .where(eq(schema.users.sessionToken, token))
        .limit(1);
      let user = userResults[0];

      if (!user) {
        return new Response(JSON.stringify({ error: "User session not found" }), { status: 404, headers: corsHeaders });
      }

      const updated = await database.update(schema.users)
        .set({ name })
        .where(eq(schema.users.id, user.id))
        .returning();

      return new Response(JSON.stringify({ success: true, user: updated[0] }), { status: 200, headers: corsHeaders });
    }

    // 3. POST /api/calculator - Process and store carbon calculations
    if (path === "/api/calculator" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { token, inputs } = body;

      if (!token || !inputs) {
        return new Response(JSON.stringify({ error: "Token and inputs are required" }), { status: 400, headers: corsHeaders });
      }

      // Get User ID
      const userResults = await database.select().from(schema.users)
        .where(eq(schema.users.sessionToken, token))
        .limit(1);
      const user = userResults[0];

      if (!user) {
        return new Response(JSON.stringify({ error: "User session not found" }), { status: 404, headers: corsHeaders });
      }

      // Extract Inputs
      const distance = parseFloat(inputs.transportDistance) || 0;
      const vehicle = inputs.transportType || "none";
      const electricity = parseFloat(inputs.electricity) || 0;
      const gas = parseFloat(inputs.gas) || 0;
      const diet = inputs.diet || "med_meat";
      const waste = inputs.waste || "med";

      // Transport calculation (annual kg CO2e)
      let transportCoefficients: Record<string, number> = {
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
      let dietConstants: Record<string, number> = {
        high_meat: 2630,
        med_meat: 1750,
        veg: 880,
        vegan: 550,
      };
      const foodEmissions = dietConstants[diet] ?? 1750;

      // Waste calculation (annual kg CO2e constants)
      let wasteConstants: Record<string, number> = {
        high: 550,
        med: 290,
        low: 110,
      };
      const wasteEmissions = wasteConstants[waste] ?? 290;

      const totalEmissions = transEmissions + energyEmissions + foodEmissions + wasteEmissions;

      // Save Calculation Log to DB
      const insertedLog = await database.insert(schema.footprintLogs).values({
        userId: user.id,
        transportEmissions: transEmissions,
        energyEmissions: energyEmissions,
        foodEmissions: foodEmissions,
        wasteEmissions: wasteEmissions,
        totalEmissions: totalEmissions,
        inputs: inputs,
      }).returning();

      // Formulate custom insights based on the highest category
      const categories = [
        { name: "Transportation", value: transEmissions, advice: "Transportation is your highest emission category. Consider cycling, walking, carpooling, or using public transit more often to save hundreds of kilograms of CO2 annually." },
        { name: "Home Energy", value: energyEmissions, advice: "Home Energy is your largest footprint contributor. Unplugging vampire electronics, turning down heating/cooling by 1-2 degrees, or replacing old lightbulbs with LEDs will significantly lower this." },
        { name: "Diet", value: foodEmissions, advice: "Your dietary footprint is high. Replacing red meat with plant-based alternatives or embracing just two Vegan days a week can dramatically lower your climate impact." },
        { name: "Waste & Consumption", value: wasteEmissions, advice: "Your consumption waste footprint has room for improvement. Committing to a composting routine and recycling cardboards/plastics reduces landfill methane emissions." }
      ];

      categories.sort((a, b) => b.value - a.value);
      const topCategory = categories[0];

      return new Response(JSON.stringify({
        success: true,
        log: insertedLog[0],
        insight: topCategory.advice,
        topCategory: topCategory.name,
      }), { status: 200, headers: corsHeaders });
    }

    // 4. POST /api/actions - Commit to a habit 'todo' or log a 'completed' event
    if (path === "/api/actions" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { token, actionId, status, savedCo2 } = body;

      if (!token || !actionId || !status || savedCo2 === undefined) {
        return new Response(JSON.stringify({ error: "Missing required parameters" }), { status: 400, headers: corsHeaders });
      }

      // Fetch user session
      const userResults = await database.select().from(schema.users)
        .where(eq(schema.users.sessionToken, token))
        .limit(1);
      const user = userResults[0];

      if (!user) {
        return new Response(JSON.stringify({ error: "User session not found" }), { status: 404, headers: corsHeaders });
      }

      if (status === "todo") {
        // Ensure only one 'todo' entry exists for this user and action
        const existingTodo = await database.select().from(schema.userActions)
          .where(and(
            eq(schema.userActions.userId, user.id),
            eq(schema.userActions.actionId, actionId),
            eq(schema.userActions.status, "todo")
          )).limit(1);

        if (existingTodo.length > 0) {
          return new Response(JSON.stringify({ success: true, message: "Action already in To-Do list", action: existingTodo[0] }), { status: 200, headers: corsHeaders });
        }

        const inserted = await database.insert(schema.userActions).values({
          userId: user.id,
          actionId,
          status: "todo",
          savedCo2: parseFloat(savedCo2) || 0,
        }).returning();

        return new Response(JSON.stringify({ success: true, action: inserted[0] }), { status: 200, headers: corsHeaders });
      } else if (status === "completed") {
        // Insert a completed habit log
        const inserted = await database.insert(schema.userActions).values({
          userId: user.id,
          actionId,
          status: "completed",
          savedCo2: parseFloat(savedCo2) || 0,
        }).returning();

        return new Response(JSON.stringify({ success: true, action: inserted[0] }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Invalid status value" }), { status: 400, headers: corsHeaders });
    }

    // 5. DELETE /api/actions - Remove or clear custom logged action/commitment
    if (path === "/api/actions" && method === "DELETE") {
      const token = url.searchParams.get("token");
      const actionId = url.searchParams.get("actionId");
      const status = url.searchParams.get("status") || "todo"; // Defaults to clearing the todo commitment

      if (!token || !actionId) {
        return new Response(JSON.stringify({ error: "Token and actionId are required" }), { status: 400, headers: corsHeaders });
      }

      // Fetch user session
      const userResults = await database.select().from(schema.users)
        .where(eq(schema.users.sessionToken, token))
        .limit(1);
      const user = userResults[0];

      if (!user) {
        return new Response(JSON.stringify({ error: "User session not found" }), { status: 404, headers: corsHeaders });
      }

      // Delete the specified todo habit card
      await database.delete(schema.userActions)
        .where(and(
          eq(schema.userActions.userId, user.id),
          eq(schema.userActions.actionId, actionId),
          eq(schema.userActions.status, status)
        ));

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    // Endpoint not matched
    return new Response(JSON.stringify({ error: "Endpoint not found" }), { status: 404, headers: corsHeaders });

  } catch (error: any) {
    console.error("API error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: error?.message || error }), { status: 500, headers: corsHeaders });
  }
};

export const config: Config = {
  path: "/api/*",
};
