"""Behavior checks for governance failures; synthetic files only."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('doc_governance', Path(__file__).parents[1] / 'check-docs.py')
docs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(docs)


class GovernanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'README.md').write_text('# Changed introduction\n', encoding='utf-8')

    def file(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')

    def test_broken_file_and_unicode_anchor_are_checked(self):
        self.file('docs/use.md', '# 标题与配置\n# Repeat\n# Repeat\n')
        self.file('README.md', '[good](docs/use.md#标题与配置) [duplicate](docs/use.md#repeat-1) [bad](missing.md) [bad heading](docs/use.md#obsolete)')
        errors = docs.link_errors(self.root, ['README.md', 'docs/use.md'])
        self.assertEqual(len(errors), 2, errors)

    def test_reference_links_and_repo_escape_fail(self):
        self.file('README.md', '[usage][ref]\n\n[ref]: absent.md\n[escape](../secret.md)\n')
        self.assertEqual(len(docs.link_errors(self.root, ['README.md'])), 2)

    def test_code_samples_and_test_fixtures_are_not_current_docs(self):
        self.file('README.md', '```md\n[example](not-real.md)\n```\n')
        self.file('app/tests/fixtures/HANDOFF_0.99.md', '[fixture](missing.md)')
        self.assertEqual(docs.link_errors(self.root, ['README.md', 'app/tests/fixtures/HANDOFF_0.99.md']), [])
        self.assertEqual(docs.policy_errors(self.root, ['app/tests/fixtures/HANDOFF_0.99.md'], []), [])

    def test_new_version_record_rejected_at_any_depth(self):
        for name in ['HANDOFF_0.99.md', 'docs/nested/VALIDATION_2027-01-01.md', 'COST_VALIDATION_0.99.md', 'UPSTREAM_0.99_AUDIT.md']:
            self.assertTrue(docs.policy_errors(self.root, [name], []), name)

    def test_machine_publication_exception_is_exact(self):
        for name in ['manifest.json', 'UPGRADE.md', 'ROLLBACK.md']:
            self.assertEqual(docs.policy_errors(self.root, [f'publications/v0.99.0-01/{name}'], []), [])
        self.assertTrue(docs.policy_errors(self.root, ['publications/v0.99.0-01/HANDOFF_0.99.md'], []))

    def test_archive_additions_require_a_specific_policy_review(self):
        for name in ['docs/archive/upstream/UPSTREAM_0.99_AUDIT.md', 'docs/archive/temporary-report.md']:
            self.file(name, 'new process')
            self.assertTrue(docs.policy_errors(self.root, [name], []))

    def test_readme_metadata_presence_does_not_imply_true_authorization(self):
        self.assertTrue(docs.policy_errors(self.root, [], ['README.md']))
        self.assertTrue(docs.policy_errors(self.root, [], ['README.md'], 'README-Authorization: yes'))
        self.assertEqual(docs.policy_errors(self.root, [], ['README.md'], 'README-Authorization: https://github.com/owner/repo/issues/1'), [])
        self.assertEqual(docs.policy_errors(self.root, [], ['README.md'], 'README-Correction: Repair the broken installation link.'), [])

    def test_changed_archive_content_or_deletion_cannot_bypass_policy(self):
        name = next(iter(docs.INITIAL_ARCHIVE))
        self.file(name, 'altered historical audit')
        self.assertTrue(docs.policy_errors(self.root, [], [name]))
        (self.root / name).unlink()
        self.assertTrue(docs.policy_errors(self.root, [], [name]))

    def test_removed_or_renamed_readme_remains_a_required_entry(self):
        (self.root / 'README.md').rename(self.root / 'PRODUCT.md')
        self.assertTrue(docs.policy_errors(self.root, [], ['README.md', 'PRODUCT.md']))

    def test_all_current_entries_and_sealed_audits_are_required(self):
        self.assertTrue(docs.required_entry_errors(self.root))
        for name in docs.CANONICAL:
            self.file(name, '# Current entry')
        self.assertEqual(docs.required_entry_errors(self.root), [])
        for name in docs.INITIAL_ARCHIVE:
            self.file(name, (docs.ROOT / name).read_text(encoding='utf-8'))
        self.assertEqual(docs.archive_errors(self.root), [])
        name = next(iter(docs.INITIAL_ARCHIVE))
        (self.root / name).unlink()
        self.assertEqual(len(docs.archive_errors(self.root)), 1)

    def test_new_topic_needs_exact_path_and_reason(self):
        self.assertTrue(docs.policy_errors(self.root, ['docs/ARCHITECTURE.md'], []))
        self.assertEqual(docs.policy_errors(self.root, ['docs/ARCHITECTURE.md'], [], 'Documentation-Topic: docs/ARCHITECTURE.md | New architecture topic with no existing authority.'), [])
        self.assertTrue(docs.policy_errors(self.root, ['docs/ARCHITECTURE.md'], [], 'Documentation-Topic: * | anything'))


if __name__ == '__main__':
    unittest.main()
