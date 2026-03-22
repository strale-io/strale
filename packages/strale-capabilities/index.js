/**
 * strale-capabilities — Local catalog of 250+ Strale capabilities.
 *
 * @example
 * const strale = require("strale-capabilities");
 * console.log(strale.totalCount); // 251
 * console.log(strale.find("iban-validate"));
 * console.log(strale.byCategory("compliance"));
 * console.log(strale.search("VAT"));
 */

"use strict";

const catalog = require("./capabilities.json");

/** All capabilities. */
const capabilities = catalog.capabilities;

/** All category strings. */
const categories = catalog.categories;

/** Total capability count. */
const totalCount = catalog.total_count;

/** Timestamp when the catalog was generated. */
const generatedAt = catalog.generated_at;

/**
 * Find a capability by slug.
 * @param {string} slug
 * @returns {object|null}
 */
function find(slug) {
  return capabilities.find((c) => c.slug === slug) || null;
}

/**
 * Filter capabilities by category.
 * @param {string} category
 * @returns {object[]}
 */
function byCategory(category) {
  return capabilities.filter((c) => c.category === category);
}

/**
 * Keyword search across slug, name, and description.
 * @param {string} query
 * @returns {object[]}
 */
function search(query) {
  const q = query.toLowerCase();
  return capabilities.filter((c) => {
    const text =
      `${c.slug} ${c.name} ${c.description} ${c.category}`.toLowerCase();
    return text.includes(q);
  });
}

module.exports = {
  capabilities,
  categories,
  totalCount,
  generatedAt,
  find,
  byCategory,
  search,
};
