import { z } from "zod";

export const RegisterUserSchema = z.object({
  name: z.string().trim().min(1).max(20),
  skin: z.string().url().max(500).optional(),
});

export const InputSchema = z.object({
  up: z.boolean(),
  down: z.boolean(),
  left: z.boolean(),
  right: z.boolean(),
  fire: z.boolean(),
});
