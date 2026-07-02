from scripts.testguard.guard import (
    find_test_declarations,
    has_removal_ack,
    removed_declarations,
)

GO_BASE = 'package x\nfunc TestA(t *testing.T){}\nfunc TestB(t *testing.T){}\n'
GO_HEAD = 'package x\nfunc TestA(t *testing.T){}\n'
PY_BASE = 'def test_x():\n    assert 1\ndef test_y():\n    assert 2\n'
PY_HEAD = 'def test_x():\n    assert 1\n'
TS_BASE = "it('does a', () => {});\ntest('does b', () => {});\n"
TS_HEAD = "it('does a', () => {});\n"


def test_go_declarations_extracted_by_name():
    # why: Go test funcs are the decl unit; keyed off the _test.go suffix.
    assert find_test_declarations('apps/x/foo_test.go', GO_BASE) == {'TestA', 'TestB'}


def test_non_test_file_yields_no_declarations():
    # why: a `func Test...` in a NON-_test.go file must not be counted.
    assert find_test_declarations('apps/x/foo.go', GO_BASE) == set()


def test_python_and_ts_declarations_extracted():
    # why: per-language extraction (Python def test_*, TS it/test titles).
    assert find_test_declarations('apps/x/test_foo.py', PY_BASE) == {'test_x', 'test_y'}
    assert find_test_declarations('apps/x/foo.spec.ts', TS_BASE) == {'does a', 'does b'}


def test_removed_declaration_detected_per_language():
    # why: a decl present in base but gone in head is a removal (the core signal).
    base = {'a_test.go': GO_BASE, 'test_p.py': PY_BASE, 'c.spec.ts': TS_BASE}
    head = {'a_test.go': GO_HEAD, 'test_p.py': PY_HEAD, 'c.spec.ts': TS_HEAD}
    assert removed_declarations(base, head) == {
        'a_test.go': ['TestB'],
        'test_p.py': ['test_y'],
        'c.spec.ts': ['does b'],
    }


def test_deleted_test_file_removes_all_its_declarations():
    # why: deleting a test file removes every decl it held.
    assert removed_declarations({'a_test.go': GO_BASE}, {'a_test.go': None}) == {
        'a_test.go': ['TestA', 'TestB']
    }


def test_rename_away_counts_as_removal():
    # why: renaming a test drops the old name — a removal (design decision).
    assert removed_declarations(
        {'a_test.go': 'func TestOld(t *testing.T){}\n'},
        {'a_test.go': 'func TestNew(t *testing.T){}\n'},
    ) == {'a_test.go': ['TestOld']}


def test_pure_addition_is_not_a_removal():
    # why: adding tests must never trip the guard.
    assert removed_declarations({'a_test.go': GO_HEAD}, {'a_test.go': GO_BASE}) == {}


def test_ack_trailer_detected_only_with_reason():
    # why: the escape hatch is an auditable trailer with a reason.
    assert has_removal_ack(['fix\n\nAllow-test-removal: obsolete behavior']) is True
    assert has_removal_ack(['fix the thing']) is False
    assert has_removal_ack(['x\n\nAllow-test-removal:']) is False  # empty reason
