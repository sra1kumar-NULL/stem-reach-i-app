import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { userDecks, customQuestions } from "@stemreach/core/db/schema";
import { CreateDeckRequest, CreateQuestionRequest } from "@stemreach/core";
import type { AppContext } from "../lib/http.js";
import { badRequest } from "../lib/http.js";

export function routes(ctx: AppContext): Hono {
  const app = new Hono();

  // GET /api/decks — List all personal decks for the user
  app.get("/", async (c) => {
    const userId = c.var.user.id;
    const decks = await ctx.db
      .select()
      .from(userDecks)
      .where(eq(userDecks.userId, userId));
    return c.json(decks);
  });

  // POST /api/decks — Create a new custom deck
  app.post("/", async (c) => {
    const userId = c.var.user.id;
    const body = await c.req.json();
    const parsed = CreateDeckRequest.safeParse(body);

    if (!parsed.success) {
      throw badRequest("Invalid deck format");
    }

    const [deck] = await ctx.db
      .insert(userDecks)
      .values({
        userId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      })
      .returning();

    return c.json(deck);
  });

  // POST /api/decks/questions — Add a custom question or flashcard
  app.post("/questions", async (c) => {
    const userId = c.var.user.id;
    const body = await c.req.json();
    const parsed = CreateQuestionRequest.safeParse(body);

    if (!parsed.success) {
      throw badRequest("Invalid deck format");
    }

    const [q] = await ctx.db
      .insert(customQuestions)
      .values({
        deckId: parsed.data.deck_id,
        userId,
        qtype: parsed.data.qtype,
        questionText: parsed.data.question_text,
        options: parsed.data.options ?? null,
        correctOption: parsed.data.correct_option ?? null,
        answer: parsed.data.answer ?? null,
        explanation: parsed.data.explanation ?? null,
      })
      .returning();

    return c.json(q);
  });

  return app;
}
