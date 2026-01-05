import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { PredictionStore } from "./prediction-store";

const TEST_DATA_DIR = join(import.meta.dir, ".test-predictions");

describe("PredictionStore", () => {
  let store: PredictionStore;

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    store = new PredictionStore(TEST_DATA_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  describe("createPrediction", () => {
    test("creates a prediction with generated ID and timestamp", () => {
      const prediction = store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 15,
        durationConfidence: "medium",
        predictedTokens: 50000,
        tokenConfidence: "medium",
        successConditions: "Tests pass",
        intentions: "Fix the bug"
      });

      expect(prediction.id).toBeDefined();
      expect(prediction.id.length).toBeGreaterThan(0);
      expect(prediction.createdAt).toBeGreaterThan(0);
      expect(prediction.managedSessionId).toBe("session-1");
      expect(prediction.predictedDurationMinutes).toBe(15);
      expect(prediction.durationConfidence).toBe("medium");
      expect(prediction.predictedTokens).toBe(50000);
      expect(prediction.tokenConfidence).toBe("medium");
      expect(prediction.successConditions).toBe("Tests pass");
      expect(prediction.intentions).toBe("Fix the bug");
    });

    test("persists prediction to JSONL file", () => {
      store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 10,
        durationConfidence: "high",
        predictedTokens: 30000,
        tokenConfidence: "low",
        successConditions: "",
        intentions: ""
      });

      const filePath = join(TEST_DATA_DIR, "predictions.jsonl");
      expect(existsSync(filePath)).toBe(true);
    });
  });

  describe("getPrediction", () => {
    test("retrieves a prediction by ID", () => {
      const created = store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 15,
        durationConfidence: "medium",
        predictedTokens: 50000,
        tokenConfidence: "medium",
        successConditions: "",
        intentions: ""
      });

      const retrieved = store.getPrediction(created.id);
      expect(retrieved).toEqual(created);
    });

    test("returns null for non-existent prediction", () => {
      const result = store.getPrediction("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("getPredictionForSession", () => {
    test("retrieves prediction by managed session ID", () => {
      const created = store.createPrediction({
        managedSessionId: "session-abc",
        predictedDurationMinutes: 20,
        durationConfidence: "low",
        predictedTokens: 100000,
        tokenConfidence: "high",
        successConditions: "",
        intentions: ""
      });

      const retrieved = store.getPredictionForSession("session-abc");
      expect(retrieved).toEqual(created);
    });

    test("returns null for non-existent session", () => {
      const result = store.getPredictionForSession("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("recordOutcome", () => {
    test("records outcome for existing prediction", () => {
      const prediction = store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 15,
        durationConfidence: "medium",
        predictedTokens: 50000,
        tokenConfidence: "medium",
        successConditions: "",
        intentions: ""
      });

      const result = store.recordOutcome({
        predictionId: prediction.id,
        managedSessionId: "session-1",
        actualDurationMinutes: 18,
        actualTokens: 55000,
        exitCode: 0,
        userMarkedSuccess: true
      });

      expect(result).not.toBeNull();
      expect(result!.outcome.actualDurationMinutes).toBe(18);
      expect(result!.outcome.actualTokens).toBe(55000);
      expect(result!.outcome.userMarkedSuccess).toBe(true);
      expect(result!.calibration.predictionId).toBe(prediction.id);
    });

    test("returns null for non-existent prediction", () => {
      const result = store.recordOutcome({
        predictionId: "non-existent",
        managedSessionId: "session-1",
        actualDurationMinutes: 18,
        actualTokens: 55000,
        exitCode: 0,
        userMarkedSuccess: true
      });

      expect(result).toBeNull();
    });
  });

  describe("calculateCalibrationResult", () => {
    test("calculates perfect score for exact predictions", () => {
      const prediction = store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 10,
        durationConfidence: "high",
        predictedTokens: 50000,
        tokenConfidence: "high",
        successConditions: "",
        intentions: ""
      });

      const outcome = {
        predictionId: prediction.id,
        managedSessionId: "session-1",
        recordedAt: Date.now(),
        actualDurationMinutes: 10,
        actualTokens: 50000,
        exitCode: 0,
        userMarkedSuccess: true
      };

      const result = store.calculateCalibrationResult(prediction, outcome);

      expect(result.durationError).toBe(0);
      expect(result.durationScore).toBe(100);
      expect(result.durationWithinConfidence).toBe(true);
      expect(result.tokenError).toBe(0);
      expect(result.tokenScore).toBe(100);
      expect(result.tokenWithinConfidence).toBe(true);
      expect(result.successScore).toBe(100);
      expect(result.overallScore).toBe(100);
    });

    test("calculates reduced score for overestimation", () => {
      const prediction = store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 20,
        durationConfidence: "medium",
        predictedTokens: 100000,
        tokenConfidence: "medium",
        successConditions: "",
        intentions: ""
      });

      const outcome = {
        predictionId: prediction.id,
        managedSessionId: "session-1",
        recordedAt: Date.now(),
        actualDurationMinutes: 10, // 50% less
        actualTokens: 50000, // 50% less
        exitCode: 0,
        userMarkedSuccess: true
      };

      const result = store.calculateCalibrationResult(prediction, outcome);

      expect(result.durationError).toBe(-0.5); // 50% under
      expect(result.durationScore).toBe(50); // 100 - 50
      expect(result.tokenError).toBe(-0.5);
      expect(result.tokenScore).toBe(50);
    });

    test("calculates reduced score for underestimation", () => {
      const prediction = store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 10,
        durationConfidence: "medium",
        predictedTokens: 50000,
        tokenConfidence: "medium",
        successConditions: "",
        intentions: ""
      });

      const outcome = {
        predictionId: prediction.id,
        managedSessionId: "session-1",
        recordedAt: Date.now(),
        actualDurationMinutes: 15, // 50% more
        actualTokens: 75000, // 50% more
        exitCode: 0,
        userMarkedSuccess: true
      };

      const result = store.calculateCalibrationResult(prediction, outcome);

      expect(result.durationError).toBe(0.5); // 50% over
      expect(result.durationScore).toBe(50);
      expect(result.tokenError).toBe(0.5);
      expect(result.tokenScore).toBe(50);
    });

    test("checks confidence intervals correctly", () => {
      const prediction = store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 100,
        durationConfidence: "high", // ±10%
        predictedTokens: 100000,
        tokenConfidence: "low", // ±50%
        successConditions: "",
        intentions: ""
      });

      const outcome = {
        predictionId: prediction.id,
        managedSessionId: "session-1",
        recordedAt: Date.now(),
        actualDurationMinutes: 120, // 20% over (outside high confidence)
        actualTokens: 140000, // 40% over (within low confidence)
        exitCode: 0,
        userMarkedSuccess: true
      };

      const result = store.calculateCalibrationResult(prediction, outcome);

      expect(result.durationWithinConfidence).toBe(false); // 20% > 10%
      expect(result.tokenWithinConfidence).toBe(true); // 40% < 50%
    });
  });

  describe("getCalibrationStats", () => {
    test("returns empty stats when no predictions", () => {
      const stats = store.getCalibrationStats();

      expect(stats.totalPredictions).toBe(0);
      expect(stats.completedPredictions).toBe(0);
      expect(stats.overallCalibrationScore).toBe(0);
      expect(stats.recentTrend).toBe("stable");
      expect(stats.history).toEqual([]);
    });

    test("returns stats with completed predictions", () => {
      const prediction = store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 10,
        durationConfidence: "medium",
        predictedTokens: 50000,
        tokenConfidence: "medium",
        successConditions: "",
        intentions: ""
      });

      store.recordOutcome({
        predictionId: prediction.id,
        managedSessionId: "session-1",
        actualDurationMinutes: 10,
        actualTokens: 50000,
        exitCode: 0,
        userMarkedSuccess: true
      });

      const stats = store.getCalibrationStats();

      expect(stats.totalPredictions).toBe(1);
      expect(stats.completedPredictions).toBe(1);
      expect(stats.overallCalibrationScore).toBe(100);
      expect(stats.recentTrend).toBe("stable");
    });
  });

  describe("listPredictions", () => {
    test("lists all predictions", () => {
      store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 10,
        durationConfidence: "medium",
        predictedTokens: 50000,
        tokenConfidence: "medium",
        successConditions: "",
        intentions: ""
      });

      store.createPrediction({
        managedSessionId: "session-2",
        predictedDurationMinutes: 20,
        durationConfidence: "high",
        predictedTokens: 100000,
        tokenConfidence: "low",
        successConditions: "",
        intentions: ""
      });

      const predictions = store.listPredictions();
      expect(predictions.length).toBe(2);
    });

    test("filters by hasOutcome", () => {
      const pred1 = store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 10,
        durationConfidence: "medium",
        predictedTokens: 50000,
        tokenConfidence: "medium",
        successConditions: "",
        intentions: ""
      });

      store.createPrediction({
        managedSessionId: "session-2",
        predictedDurationMinutes: 20,
        durationConfidence: "high",
        predictedTokens: 100000,
        tokenConfidence: "low",
        successConditions: "",
        intentions: ""
      });

      store.recordOutcome({
        predictionId: pred1.id,
        managedSessionId: "session-1",
        actualDurationMinutes: 10,
        actualTokens: 50000,
        exitCode: 0,
        userMarkedSuccess: true
      });

      const withOutcome = store.listPredictions({ hasOutcome: true });
      expect(withOutcome.length).toBe(1);
      expect(withOutcome[0]?.prediction.managedSessionId).toBe("session-1");

      const withoutOutcome = store.listPredictions({ hasOutcome: false });
      expect(withoutOutcome.length).toBe(1);
      expect(withoutOutcome[0]?.prediction.managedSessionId).toBe("session-2");
    });

    test("limits results", () => {
      for (let i = 0; i < 10; i++) {
        store.createPrediction({
          managedSessionId: `session-${i}`,
          predictedDurationMinutes: 10,
          durationConfidence: "medium",
          predictedTokens: 50000,
          tokenConfidence: "medium",
          successConditions: "",
          intentions: ""
        });
      }

      const limited = store.listPredictions({ limit: 5 });
      expect(limited.length).toBe(5);
    });
  });

  describe("persistence", () => {
    test("reloads data after recreation", () => {
      const prediction = store.createPrediction({
        managedSessionId: "session-1",
        predictedDurationMinutes: 15,
        durationConfidence: "medium",
        predictedTokens: 50000,
        tokenConfidence: "medium",
        successConditions: "",
        intentions: ""
      });

      store.recordOutcome({
        predictionId: prediction.id,
        managedSessionId: "session-1",
        actualDurationMinutes: 18,
        actualTokens: 55000,
        exitCode: 0,
        userMarkedSuccess: true
      });

      // Create new store instance
      const newStore = new PredictionStore(TEST_DATA_DIR);

      const retrieved = newStore.getPrediction(prediction.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.managedSessionId).toBe("session-1");

      const outcome = newStore.getOutcome(prediction.id);
      expect(outcome).not.toBeNull();
      expect(outcome!.actualDurationMinutes).toBe(18);
    });
  });
});
