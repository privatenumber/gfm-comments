// Parses NUL-separated HTML fragments from stdin in a body context with the
// patched gumbo (gumbo.patch). For each fragment, writes every comment node
// that starts with a real `<!--`, in tree order, as its source markup, 0x1F,
// its text, and 0x1E, then a NUL.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "gumbo.h"

static void walk(const GumboNode *node) {
  if (node->type == GUMBO_NODE_COMMENT) {
    const GumboStringPiece *raw = &node->v.text.original_text;
    if (raw->length >= 4 && !memcmp(raw->data, "<!--", 4)) {
      fwrite(raw->data, 1, raw->length, stdout);
      putchar(0x1F);
      fputs(node->v.text.text, stdout);
      putchar(0x1E);
    }
    return;
  }
  if (node->type == GUMBO_NODE_DOCUMENT || node->type == GUMBO_NODE_ELEMENT || node->type == GUMBO_NODE_TEMPLATE) {
    const GumboVector *children = node->type == GUMBO_NODE_DOCUMENT
      ? &node->v.document.children
      : &node->v.element.children;
    for (unsigned int i = 0; i < children->length; i++) {
      walk(children->data[i]);
    }
  }
}

int main(void) {
  GumboOptions options = kGumboDefaultOptions;
  options.fragment_context = "body";
  options.fragment_namespace = GUMBO_NAMESPACE_HTML;
  options.max_tree_depth = 1 << 20;
  size_t cap = 1 << 20, len = 0;
  char *buf = malloc(cap);
  int c;
  for (;;) {
    c = getchar();
    if (c == EOF || c == 0) {
      if (c == EOF && len == 0) break;
      GumboOutput *output = gumbo_parse_with_options(&options, buf, len);
      walk(output->document);
      gumbo_destroy_output(output);
      putchar(0);
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
