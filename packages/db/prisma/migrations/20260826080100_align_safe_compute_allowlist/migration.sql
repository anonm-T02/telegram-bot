-- Keep database issuance bounds identical to the checked-in integer-mix v1
-- worker contract. A looser database limit must not mint unsupported tasks.
ALTER TABLE "ComputeTask" DROP CONSTRAINT "ComputeTask_iterations_valid";
ALTER TABLE "ComputeTask" ADD CONSTRAINT "ComputeTask_iterations_valid"
  CHECK ("iterations" BETWEEN 1 AND 250000);

ALTER TABLE "ComputeTask" DROP CONSTRAINT "ComputeTask_hashes_present";
ALTER TABLE "ComputeTask" ADD CONSTRAINT "ComputeTask_hashes_present" CHECK (
  "expectedDigest" ~ '^[a-f0-9]{64}$'
  AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND "signature" ~ '^[a-f0-9]{64}$'
);

ALTER TABLE "ComputeResult" DROP CONSTRAINT "ComputeResult_values_valid";
ALTER TABLE "ComputeResult" ADD CONSTRAINT "ComputeResult_values_valid" CHECK (
  "outputDigest" ~ '^[a-f0-9]{64}$'
  AND "elapsedMs" BETWEEN 0 AND 30000
  AND "workerCount" BETWEEN 1 AND 2
  AND "validatedUnits" >= 0
);
