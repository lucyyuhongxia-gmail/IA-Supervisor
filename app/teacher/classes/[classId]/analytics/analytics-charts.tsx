"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

type ChartDatum = {
  label: string;
  value: number;
};

type CriterionChartDatum = {
  criterion: string;
  passed: number;
  submitted: number;
  revisionNeeded: number;
  notStarted: number;
};

type AnalyticsChartsProps = {
  statusSummary: ChartDatum[];
  criterionStatus: CriterionChartDatum[];
};

const statusColors = ["#10b981", "#2563eb", "#f59e0b", "#94a3b8"];

export function AnalyticsCharts({
  statusSummary,
  criterionStatus,
}: AnalyticsChartsProps) {
  const completionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const criterionCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!completionCanvasRef.current) {
      return;
    }

    const chart = new Chart(completionCanvasRef.current, {
      type: "doughnut",
      data: {
        labels: statusSummary.map((item) => item.label),
        datasets: [
          {
            data: statusSummary.map((item) => item.value),
            backgroundColor: statusColors,
            borderColor: "#ffffff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
          },
        },
      },
    });

    return () => chart.destroy();
  }, [statusSummary]);

  useEffect(() => {
    if (!criterionCanvasRef.current) {
      return;
    }

    const chart = new Chart(criterionCanvasRef.current, {
      type: "bar",
      data: {
        labels: criterionStatus.map((item) => item.criterion),
        datasets: [
          {
            label: "Passed",
            data: criterionStatus.map((item) => item.passed),
            backgroundColor: "#10b981",
          },
          {
            label: "Submitted / in review",
            data: criterionStatus.map((item) => item.submitted),
            backgroundColor: "#2563eb",
          },
          {
            label: "Needs revision",
            data: criterionStatus.map((item) => item.revisionNeeded),
            backgroundColor: "#f59e0b",
          },
          {
            label: "Not started",
            data: criterionStatus.map((item) => item.notStarted),
            backgroundColor: "#94a3b8",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              precision: 0,
            },
          },
        },
        plugins: {
          legend: {
            position: "bottom",
          },
        },
      },
    });

    return () => chart.destroy();
  }, [criterionStatus]);

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-md border p-4">
        <div>
          <p className="font-medium">Overall status mix</p>
          <p className="mt-1 text-sm text-muted-foreground">
            All criterion slots across this class.
          </p>
        </div>
        <div className="mt-4 h-72">
          <canvas ref={completionCanvasRef} aria-label="Overall class status chart" />
        </div>
      </div>
      <div className="rounded-md border p-4">
        <div>
          <p className="font-medium">Criterion status distribution</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Stacked by Criterion A-E.
          </p>
        </div>
        <div className="mt-4 h-72">
          <canvas ref={criterionCanvasRef} aria-label="Criterion status chart" />
        </div>
      </div>
    </div>
  );
}
