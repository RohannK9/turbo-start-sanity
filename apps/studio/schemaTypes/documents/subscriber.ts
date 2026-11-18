import { Mail } from "lucide-react";
import { defineField, defineType } from "sanity";

export const subscriber = defineType({
  name: "subscriber",
  title: "Subscriber",
  type: "document",
  icon: Mail,
  fields: [
    defineField({
      name: "email",
      title: "Email",
      type: "string",
      readOnly: true,
      validation: (rule) => rule.required().email(),
    }),
    defineField({
      name: "signedUpAt",
      title: "Signed up at",
      type: "datetime",
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
  ],
  preview: { select: { title: "email", subtitle: "signedUpAt" } },
});
