// Renders NUL-separated Markdown documents from stdin with GitHub's
// extensions and writes NUL-separated HTML to stdout.
#include <stdio.h>
#include <stdlib.h>
#include "cmark-gfm.h"
#include "cmark-gfm-core-extensions.h"

static const char *extensions[] = {"table", "strikethrough", "autolink", "tagfilter", "tasklist"};

int main(void) {
  int options = CMARK_OPT_UNSAFE | CMARK_OPT_GITHUB_PRE_LANG | CMARK_OPT_FOOTNOTES;
  cmark_gfm_core_extensions_ensure_registered();
  size_t cap = 1 << 20, len = 0;
  char *buf = malloc(cap);
  int c;
  for (;;) {
    c = getchar();
    if (c == EOF || c == 0) {
      if (c == EOF && len == 0) break;
      cmark_parser *parser = cmark_parser_new(options);
      for (size_t i = 0; i < sizeof extensions / sizeof *extensions; i++) {
        cmark_parser_attach_syntax_extension(parser, cmark_find_syntax_extension(extensions[i]));
      }
      cmark_parser_feed(parser, buf, len);
      cmark_node *doc = cmark_parser_finish(parser);
      char *html = cmark_render_html(doc, options, cmark_parser_get_syntax_extensions(parser));
      fputs(html, stdout);
      putchar(0);
      free(html);
      cmark_node_free(doc);
      cmark_parser_free(parser);
      len = 0;
      if (c == EOF) break;
      continue;
    }
    if (len + 1 >= cap) buf = realloc(buf, cap *= 2);
    buf[len++] = (char)c;
  }
  fflush(stdout);
  return 0;
}
