// Prints each Unicode scalar and its cmark-gfm case fold as hexadecimal UTF-8.
#include <stdio.h>
#include "utf8.h"
#include "buffer.h"

int main(void) {
  cmark_mem *mem = cmark_get_default_mem_allocator();
  cmark_strbuf input = CMARK_BUF_INIT(mem);
  cmark_strbuf output = CMARK_BUF_INIT(mem);
  for (int cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    cmark_strbuf_clear(&input);
    cmark_strbuf_clear(&output);
    if (cp == 0xfffe || cp == 0xffff) {
      unsigned char bytes[] = {0xef, 0xbf, cp == 0xfffe ? 0xbe : 0xbf};
      cmark_strbuf_put(&input, bytes, 3);
    } else cmark_utf8proc_encode_char(cp, &input);
    cmark_utf8proc_case_fold(&output, input.ptr, input.size);
    printf("%x\t", cp);
    for (int i = 0; i < output.size; i++) printf("%02x", output.ptr[i]);
    putchar('\n');
  }
  cmark_strbuf_free(&input);
  cmark_strbuf_free(&output);
}
