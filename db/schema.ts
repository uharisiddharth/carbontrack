import { pgTable, serial, text, timestamp, doublePrecision, jsonb, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const footprintLogs = pgTable("footprint_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  transportEmissions: doublePrecision("transport_emissions").notNull(),
  energyEmissions: doublePrecision("energy_emissions").notNull(),
  foodEmissions: doublePrecision("food_emissions").notNull(),
  wasteEmissions: doublePrecision("waste_emissions").notNull(),
  totalEmissions: doublePrecision("total_emissions").notNull(),
  inputs: jsonb("inputs").notNull(),
  loggedAt: timestamp("logged_at").defaultNow().notNull(),
});

export const userActions = pgTable("user_actions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  actionId: text("action_id").notNull(),
  status: text("status").notNull(), // 'todo' or 'completed'
  savedCo2: doublePrecision("saved_co2").notNull(),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});
