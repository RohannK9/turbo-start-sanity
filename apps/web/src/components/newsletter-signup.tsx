"use client";

import {
  SubscribeNewsletter,
  type SubscribeNewsletterProps,
} from "@workspace/sanity-blocks/subscribe-newsletter/index";
import { useActionState } from "react";

type SignupState = { message: string; isError: boolean };

async function signup(
  _previous: SignupState,
  formData: FormData
): Promise<SignupState> {
  try {
    // Let fetch set the multipart boundary. This is the actual browser form payload.
    const response = await fetch("/api/newsletter", {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      return { message: "You're subscribed. Thank you!", isError: false };
    }
    const message =
      response.status === 429
        ? "Too many signup attempts. Please wait a few minutes and try again."
        : response.status === 400
          ? "Enter a valid email address."
          : "Signup is temporarily unavailable. Please try again later.";
    return { message, isError: true };
  } catch {
    return {
      message: "Couldn't connect. Check your connection and try again.",
      isError: true,
    };
  }
}

export function NewsletterSignup(
  props: Omit<
    SubscribeNewsletterProps,
    "action" | "method" | "onSubmit" | "feedback"
  >
) {
  const [state, action] = useActionState(signup, {
    message: "",
    isError: false,
  });
  return <SubscribeNewsletter {...props} action={action} feedback={state} />;
}
