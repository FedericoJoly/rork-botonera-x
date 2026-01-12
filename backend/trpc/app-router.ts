import { createTRPCRouter } from "./create-context";
import { exampleRouter } from "./routes/example";
import { googleSheetsRouter } from "./routes/google-sheets";

export const appRouter = createTRPCRouter({
  example: exampleRouter,
  googleSheets: googleSheetsRouter,
});

export type AppRouter = typeof appRouter;
