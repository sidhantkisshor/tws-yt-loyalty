-- Add CHECK constraint to prevent negative points
ALTER TABLE "Viewer" ADD CONSTRAINT "Viewer_availablePoints_non_negative" CHECK ("availablePoints" >= 0);
ALTER TABLE "Viewer" ADD CONSTRAINT "Viewer_totalPoints_non_negative" CHECK ("totalPoints" >= 0);
