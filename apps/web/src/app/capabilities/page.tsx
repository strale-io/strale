import type { Metadata } from "next";
import { Suspense } from "react";
import { getCapabilities, getCategories } from "@/lib/api";
import { CapabilityCatalog } from "@/components/capability-catalog";

export const metadata: Metadata = {
  title: "Capabilities",
  description:
    "Browse all Strale capabilities — company data, validation, finance, compliance, and more. Transparent per-call pricing.",
};

export const revalidate = 3600;

export default async function CapabilitiesPage() {
  const capabilities = await getCapabilities();
  const categories = getCategories(capabilities);

  return (
    <Suspense>
      <CapabilityCatalog capabilities={capabilities} categories={categories} />
    </Suspense>
  );
}
