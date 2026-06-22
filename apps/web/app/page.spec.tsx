import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('HomePage', () => {
  it('renders a visible auth status alert near the auth forms', () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="polite"');
  });
});
