import math

from cohort_stats.utils import (
    iso_to_years,
    make_histogram,
    mean_of,
    median_of,
    percentile,
    sanitize,
)


class TestIsoToYears:
    def test_years_and_months(self):
        assert iso_to_years("P12Y6M") == 12.5

    def test_years_only(self):
        assert iso_to_years("P3Y") == 3.0

    def test_months_only(self):
        assert iso_to_years("P6M") == 0.5

    def test_none_and_empty(self):
        assert iso_to_years(None) is None
        assert iso_to_years("") is None

    def test_no_period_prefix(self):
        assert iso_to_years("12Y") is None

    def test_time_only_duration_matches_original_behaviour(self):
        # The original viewer returned 0 for durations like PT5M — keep that.
        assert iso_to_years("PT5M") == 0.0


class TestMedianAndPercentiles:
    def test_upper_median_even_length(self):
        # Original semantics: sorted[n // 2]
        assert median_of([1, 2, 3, 4]) == 3

    def test_median_odd_length(self):
        assert median_of([1, 2, 3]) == 2

    def test_empty(self):
        assert median_of([]) is None
        assert percentile([], 0.5) is None
        assert mean_of([]) is None

    def test_percentile_floor_indexing(self):
        vals = list(range(10))  # 0..9
        assert percentile(vals, 0.25) == 2
        assert percentile(vals, 0.95) == 9

    def test_mean(self):
        assert mean_of([1, 2, 3]) == 2.0


class TestHistogram:
    def test_basic_binning(self):
        h = make_histogram([1, 2, 7, 12], 5)
        assert h["labels"] == ["0–4", "5–9", "10–14"]
        assert h["bins"] == [2, 1, 1]

    def test_single_value_on_boundary(self):
        # All values identical & on a bin edge must not crash (original JS bug)
        h = make_histogram([1990, 1990], 1)
        assert sum(h["bins"]) == 2

    def test_empty(self):
        assert make_histogram([], 5) == {"labels": [], "bins": []}


class TestSanitize:
    def test_replaces_non_finite(self):
        out = sanitize({"a": float("nan"), "b": [1.0, float("inf")], "c": 2})
        assert out == {"a": None, "b": [1.0, None], "c": 2}

    def test_valid_floats_untouched(self):
        assert sanitize(1.5) == 1.5
        assert not math.isnan(sanitize(0.0))
