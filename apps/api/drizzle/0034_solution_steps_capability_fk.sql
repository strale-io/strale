-- Add foreign key: solution_steps.capability_slug → capabilities.slug
-- ON DELETE RESTRICT: prevents deleting a capability that is referenced by a solution step
ALTER TABLE "solution_steps"
  ADD CONSTRAINT "solution_steps_capability_slug_capabilities_slug_fk"
  FOREIGN KEY ("capability_slug") REFERENCES "capabilities"("slug")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
