"""Tests for every tab's compute function, on both a minimal packet and the
synthetic example cohort."""

import json

import cohort_stats
from cohort_stats import (
    demographics,
    diagnoses,
    diseases,
    genes,
    measurements,
    phenotypes,
)


class TestDemographics:
    def test_minimal(self, minimal_packet):
        d = demographics.compute([minimal_packet])
        assert d["n_patients"] == 1
        assert d["sex_counts"] == {"FEMALE": 1}
        assert d["alive"] == 1 and d["deceased"] == 0
        assert d["earliest_birth_year"] == 1990
        assert d["encounter_summary"]["median"] == 30.5

    def test_missing_everything(self):
        d = demographics.compute([{}])
        assert d["n_patients"] == 1
        assert d["sex_counts"] == {"UNKNOWN": 1}
        assert d["yob_hist"] == {"labels": [], "bins": []}

    def test_example_cohort(self, example_packets):
        d = demographics.compute(example_packets)
        assert d["n_patients"] == len(example_packets)
        assert sum(d["sex_counts"].values()) == len(example_packets)
        assert sum(d["age_encounter_hist"]["bins"]) == d["encounter_summary"]["n"]


class TestDiagnoses:
    def test_minimal(self, minimal_packet):
        d = diagnoses.compute([minimal_packet])
        assert len(d["table"]) == 1
        row = d["table"][0]
        assert row["id"] == "MONDO:0000001"
        assert row["count"] == 1
        assert row["median_onset"] == 2.5  # from the diseases block

    def test_example_cohort(self, example_packets):
        d = diagnoses.compute(example_packets)
        assert d["n_unique"] >= 1
        assert sum(r["count"] for r in d["table"]) >= len(example_packets)
        # table sorted by count desc
        counts = [r["count"] for r in d["table"]]
        assert counts == sorted(counts, reverse=True)


class TestGenes:
    def test_minimal(self, minimal_packet):
        g = genes.compute([minimal_packet])
        assert g["stats"]["unique_genes"] == 1
        assert g["stats"]["unique_variants"] == 1
        assert g["stats"]["path_count"] == 1
        v = g["variants"][0]
        assert v["gene"] == "GENE1"
        assert v["hgvs"] == "NM_1:c.1A>G"
        assert v["allelic"] == "heterozygous"
        assert v["n_individuals"] == 1
        assert g["gene_summary"][0]["top_acmg"] == "PATHOGENIC"
        assert "records" not in g["gene_summary"][0]

    def test_variants_are_deduplicated(self, minimal_packet):
        """Two individuals with the same variant + zygosity collapse to one row
        whose frequency is 2; a different zygosity is a separate row."""
        import copy

        p2 = copy.deepcopy(minimal_packet)
        p2["subject"]["id"] = "P2"
        p3 = copy.deepcopy(minimal_packet)
        p3["subject"]["id"] = "P3"
        vd = p3["interpretations"][0]["diagnosis"]["genomicInterpretations"][0][
            "variantInterpretation"]["variationDescriptor"]
        vd["allelicState"] = {"label": "homozygous"}

        g = genes.compute([minimal_packet, p2, p3])
        assert g["stats"]["unique_variants"] == 2
        by_zyg = {v["allelic"]: v for v in g["variants"]}
        assert by_zyg["heterozygous"]["n_individuals"] == 2
        assert by_zyg["homozygous"]["n_individuals"] == 1
        # sorted by frequency desc
        assert g["variants"][0]["allelic"] == "heterozygous"

    def test_top20_counts_individuals_not_records(self, minimal_packet):
        """The same gene listed twice for one person counts once."""
        import copy

        p = copy.deepcopy(minimal_packet)
        gi = p["interpretations"][0]["diagnosis"]["genomicInterpretations"]
        gi.append(copy.deepcopy(gi[0]))
        g = genes.compute([p])
        assert g["top20"] == {"labels": ["GENE1"], "counts": [1]}

    def test_gene_without_symbol_skipped(self):
        packet = {
            "interpretations": [{
                "diagnosis": {"genomicInterpretations": [
                    {"variantInterpretation": {"variationDescriptor": {}}}
                ]}
            }]
        }
        assert genes.compute([packet])["variants"] == []

    def test_explorer_views(self, example_packets):
        for view in ("gene-per-dx", "dx-per-gene"):
            e = genes.explorer(example_packets, view=view, top_n=5)
            assert not e["empty"]
            assert len(e["primary_keys"]) <= 5
            for ds in e["datasets"]:
                assert len(ds["data"]) == len(e["primary_keys"])

        h = genes.explorer(example_packets, view="heatmap", top_n=4)
        assert len(h["matrix"]) == len(h["genes"]) <= 4
        assert all(len(row) == len(h["diagnoses"]) for row in h["matrix"])

    def test_explorer_empty(self):
        assert genes.explorer([], view="heatmap")["empty"] is True

    def test_top_n_zero_means_all(self, example_packets):
        e = genes.explorer(example_packets, view="dx-per-gene", top_n=0)
        all_genes = {r["gene"] for r in genes.collect_gene_rows(example_packets)}
        assert set(e["primary_keys"]) == all_genes


class TestPhenotypes:
    def test_minimal_excluded_skipped(self, minimal_packet):
        ph = phenotypes.compute([minimal_packet])
        assert [r["id"] for r in ph["table"]] == ["HP:0000001"]
        assert ph["table"][0]["median_onset"] == 5.0
        assert "top_severity" not in ph["table"][0]

    def test_over_time_grouping(self, example_packets):
        ph = phenotypes.compute(example_packets)
        term = next(r for r in ph["table"] if r["has_onset"])
        for group_by in ("cohort", "sex", "diagnosis"):
            ot = phenotypes.over_time(example_packets, term["id"], group_by, ecdf_base="term")
            assert not ot["empty"]
            total = sum(g["n"] for g in ot["groups"])
            assert total == ot["n_records"]
            for g in ot["groups"]:
                assert sum(g["bins"]) == g["n"]
                assert len(g["bins"]) == len(ot["hist_labels"])
                # classic ECDF: always reaches 100 %
                assert g["ecdf"][-1]["y"] == 100.0

    def test_over_time_ecdf_cohort_denominator(self, example_packets):
        """With ecdf_base='cohort' (the default) 100 % is the whole group, so
        the curve plateaus at n / group_size and is extended flat to the
        right-most onset age across all groups."""
        ph = phenotypes.compute(example_packets)
        term = next(r for r in ph["table"] if r["has_onset"])
        ot = phenotypes.over_time(example_packets, term["id"], "cohort")
        assert ot["ecdf_base"] == "cohort"
        (g,) = ot["groups"]
        assert g["group_size"] == len(example_packets)
        assert g["ecdf"][-1]["y"] == g["n"] / len(example_packets) * 100
        assert g["ecdf"][-1]["y"] < 100.0

        by_sex = phenotypes.over_time(example_packets, term["id"], "sex")
        x_max = max(a for grp in by_sex["groups"] for a in grp["ages"])
        sex_sizes = {}
        for p in example_packets:
            s = p["subject"]["sex"]
            sex_sizes[s] = sex_sizes.get(s, 0) + 1
        for grp in by_sex["groups"]:
            assert grp["group_size"] == sex_sizes[grp["name"]]
            assert grp["ecdf"][-1]["x"] == x_max  # extended flat to the edge
            assert grp["ecdf"][-1]["y"] == grp["n"] / grp["group_size"] * 100

    def test_over_time_unknown_term(self, example_packets):
        assert phenotypes.over_time(example_packets, "HP:9999999")["empty"] is True

    def test_explorer_dx_per_term(self, example_packets):
        e = phenotypes.explorer(example_packets, view="dx-per-term", top_n=5)
        assert not e["empty"]
        assert len(e["primary_keys"]) <= 5
        for ds in e["datasets"]:
            assert len(ds["data"]) == len(e["primary_keys"])
        # stacks add up to the per-term individual count only when every
        # individual has exactly one diagnosis (true for the example cohort)
        for i, total in enumerate(e["primary_totals"]):
            assert sum(ds["data"][i] for ds in e["datasets"]) == total

    def test_explorer_term_per_dx(self, example_packets):
        e = phenotypes.explorer(example_packets, view="term-per-dx", top_n=3)
        assert not e["empty"]
        # defaults to the most frequent diagnosis
        assert e["diagnosis"] == e["dx_options"][0]["label"]
        assert len(e["terms"]) <= 3
        for t in e["terms"]:
            assert 0 < t["n"] <= e["n_dx"]
            assert t["pct"] == t["n"] / e["n_dx"] * 100
        # explicit diagnosis is respected
        other = e["dx_options"][-1]["label"]
        e2 = phenotypes.explorer(example_packets, view="term-per-dx", top_n=0, diagnosis=other)
        assert e2["diagnosis"] == other

    def test_explorer_heatmap(self, example_packets):
        h = phenotypes.explorer(example_packets, view="heatmap", top_n=4)
        assert len(h["matrix"]) == len(h["terms"]) <= 4
        assert len(h["diagnoses"]) <= 4
        assert all(len(row) == len(h["diagnoses"]) for row in h["matrix"])
        assert all(0.0 <= v <= 100.0 for row in h["pct"] for v in row)

    def test_explorer_counts_individuals_once(self, minimal_packet):
        """A term listed twice for one individual counts once; an individual
        without any interpretation lands under 'No diagnosis'."""
        import copy

        p = copy.deepcopy(minimal_packet)
        p["phenotypicFeatures"].append(copy.deepcopy(p["phenotypicFeatures"][0]))
        q = {"subject": {"id": "P9"},
             "phenotypicFeatures": [{"type": {"id": "HP:0000001", "label": "Feature A"}}]}
        e = phenotypes.explorer([p, q], view="dx-per-term", top_n=0)
        assert e["primary_keys"] == ["Feature A"]
        assert e["primary_totals"] == [2]
        by_dx = {ds["label"]: ds["data"][0] for ds in e["datasets"]}
        assert by_dx == {"Disease X": 1, phenotypes.NO_DX: 1}

    def test_explorer_empty(self):
        assert phenotypes.explorer([{}], view="heatmap")["empty"] is True


class TestDiseases:
    def test_minimal(self, minimal_packet):
        d = diseases.compute([minimal_packet])
        assert d["table"][0]["min_onset"] == 2.5

    def test_example_cohort(self, example_packets):
        d = diseases.compute(example_packets)
        assert len(d["chart"]["labels"]) == min(30, len(d["table"]))


class TestMeasurements:
    def test_minimal(self, minimal_packet):
        m = measurements.compute([minimal_packet])
        assert m["stats"]["records"] == 2
        assert m["stats"]["unique_assays"] == 1
        assay = m["assays"][0]
        assert assay["min"] == 42.0 and assay["max"] == 58.0
        assert assay["mean"] == 50.0

    def test_non_numeric_and_missing_skipped(self):
        packet = {"measurements": [
            {"assay": {"id": "L1"}, "value": {"quantity": {"value": "abc"}}},
            {"assay": {"id": "L1"}, "value": {}},
        ]}
        assert measurements.compute([packet])["stats"]["records"] == 0

    def test_assay_detail(self, example_packets):
        m = measurements.compute(example_packets)
        top = m["assays"][0]
        d = measurements.assay_detail(example_packets, top["id"])
        assert not d["empty"]
        assert sum(d["bins"]) == d["n_records"] == top["n_records"]
        assert 8 <= len(d["bins"]) <= 30
        assert d["summary"]["median"] == top["median"]

    def test_over_time(self, example_packets):
        m = measurements.compute(example_packets)
        top = m["assays"][0]
        ot = measurements.over_time(example_packets, top["id"], "sex")
        assert not ot["empty"]
        assert ot["time_type"] == "age"
        for g in ot["groups"]:
            xs = [p["x"] for p in g["median_line"]]
            assert xs == sorted(xs)

    def test_timestamp_parsing(self):
        packet = {"measurements": [{
            "assay": {"id": "L1", "label": "A"},
            "value": {"quantity": {"value": 5}},
            "timeObserved": {"timestamp": "2020-06-01T12:00:00Z"},
        }]}
        recs = measurements.collect_records([packet])
        assert recs[0]["time_type"] == "date"
        assert recs[0]["time_val"] is not None
        assert recs[0]["time_date"] == "2020-06-01"


class TestTopLevel:
    def test_compute_all_and_api_roundtrip(self, example_packets):
        cohort_stats.load_cohort(json.dumps(example_packets))
        payload = json.loads(cohort_stats.compute_all_json())
        assert set(payload) >= {
            "demographics", "diagnoses", "genes", "phenotypes",
            "diseases", "measurements", "header",
        }
        assert payload["header"]["n_patients"] == len(example_packets)

        out = json.loads(cohort_stats.api(
            "gene_dx_explorer",
            json.dumps({"view": "heatmap", "top_n": 3}),
        ))
        assert len(out["genes"]) <= 3

    def test_header_stats_ignores_missing_disease_ids(self):
        packets = [
            {"interpretations": [{"diagnosis": {}}]},
            {"interpretations": [{"diagnosis": {"disease": {"id": "M:1"}}}]},
        ]
        assert cohort_stats.header_stats(packets)["n_unique_dx"] == 1
