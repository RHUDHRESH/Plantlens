"""Alarm management — ISA-18.2 / EEMUA 191 (Domain J).

KPI targets (instrumented as live metrics in kpis.py so compliance is provable
on stage, not merely asserted):
  - steady-state rate < 1 alarm / 10 min / operator (EEMUA 191)
  - upset-peak < 10 / 10 min
  - standing alarms < 10 / operator (ISA-18.2 Annex A)
  - priority distribution ~5% high / ~15% medium / ~80% low (ISA-18.2 Annex A)
  - flood: >10 alarms in any 10-min window (target %time in flood < 1%)
All KPIs tracked PER OPERATING POSITION, not plant-wide.
"""
