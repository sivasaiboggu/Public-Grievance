# GrievanceGrid Metric Definitions

All metrics in GrievanceGrid are computed strictly from real database records according to versioned civic rule rubrics. No metrics or priority scores are fabricated or simulated.

## 1. Core Period Metrics

- **Reports Received**: Total citizen complaint submissions created within the selected time window (`created_at >= start_date` and `created_at <= end_date`).
- **Fixed (Resolved)**: Total complaints that transitioned to the `resolved` status within the period (`updated_at >= start_date` and `updated_at <= end_date` with `status = 'resolved'`).
- **Fixed on Time**: Complaints resolved where total turnaround time (`updated_at - received_at`) was less than or equal to the category's configured service standard target hours (`target_hours`).
- **Fixed Late**: Complaints resolved where turnaround time exceeded the target standard (`(updated_at - received_at) > target_hours`).
- **Overdue**: Open complaints (`status` in `['submitted', 'under_review', 'in_progress']`) whose elapsed time since submission has exceeded `target_hours`.
- **Average Time to Fix**: Mean turnaround time of all complaints resolved in the period:
  $$\text{Average Time to Fix} = \frac{1}{N_{\text{resolved}}} \sum_{i=1}^{N_{\text{resolved}}} (T_{\text{resolved}, i} - T_{\text{received}, i})$$
  Formatted in plain human language (e.g., "2 days 5 hours", "3 hours", "45 minutes").

## 2. Comparative Period Analysis

For any chosen time window (7 days, 30 days, or 90 days), comparisons are computed against the immediate preceding period of equal duration:
$$\Delta = \text{Metric}_{\text{current}} - \text{Metric}_{\text{previous}}$$
Displayed as a quiet, human-readable indicator (e.g., "12 more than the 30 days before", "3 fewer than previous period").

## 3. Category & Team Breakdown

- **Where Reports Come From**: Distribution of reports by civic category (Road damage, Garbage, Waterlogging, Open drain or blockage, Damaged public property, Street light, Water supply, Other). Displayed as horizontal bars with category names directly on the axis and counts at the end of each bar.
- **Fixed on Time Comparison**: Stacked breakdown per category showing `fixed_on_time` versus `fixed_late`, computed strictly from resolved reports.
- **Where Most Open Reports Are**: Aggregated by localized ward / neighborhood names (`area_name`), such as Fort Kochi, Edappally, Kaloor, Marine Drive, Kadavanthra, and Vyttila. Raw geographic coordinates are never displayed to users.
- **Teams Table**: Operational breakdown of active teams with open counts, fixed counts, average resolution duration, and overdue counts. Teams with zero jobs display "No jobs yet" rather than empty cells.
