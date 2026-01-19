import { createTRPCRouter } from "./create-context";
import { exampleRouter } from "./routes/example";
import { passwordRecoveryRouter } from "./routes/password-recovery";

export const appRouter = createTRPCRouter({
  example: exampleRouter,
  passwordRecovery: passwordRecoveryRouter,
});

export type AppRouter = typeof appRouter;
