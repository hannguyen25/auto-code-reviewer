import { ParsedDiffContext } from '../schemas/review-state.schema';

export class PromptSanitizer {
  static escapeXmlTags(content: string): string {
    if (!content) return '';
    return content
      .replace(/<\/untrusted_user_code>/gi, '&lt;/untrusted_user_code&gt;')
      .replace(/<untrusted_user_code>/gi, '&lt;untrusted_user_code&gt;');
  }

  static wrapDiffContext(files: ParsedDiffContext[]): string {
    if (!files || files.length === 0) {
      return '<untrusted_user_code>\n[Empty Diff]\n</untrusted_user_code>';
    }

    const formattedFiles = files
      .map((file, index) => {
        const filePath = file.filePath || (file as any).path || (file as any).filename || 'unknown';
        const safeDiff = this.escapeXmlTags(file.rawDiff || '');
        return `
<file index="${index + 1}" path="${filePath}">
${safeDiff}
</file>`.trim();
      })
      .join('\n\n');

    return `<untrusted_user_code>\n${formattedFiles}\n</untrusted_user_code>`;
  }
}