-- AddColumn: category and supportedSizes on Template
-- category is a nullable text column (product | promo | awareness | seasonal | evergreen)
-- supportedSizes is a text[] column (empty array = all sizes supported)

ALTER TABLE "Template"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "supportedSizes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
