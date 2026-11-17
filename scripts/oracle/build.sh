#!/bin/sh
# Builds the GitHub oracle into node_modules/.cache/gfm-oracle: cmark-gfm
# 0.29.0.gfm.13 from source, then batch.c and fold-scalars.c against it.
# Needs curl, tar, CMake, and a C compiler. Run it again after changing
# batch.c or fold-scalars.c; it reuses the downloaded and built cmark-gfm.
set -eu

version=0.29.0.gfm.13
sha256=5abc61798ebd9de5660bc076443c07abad2b8d15dbc11094a3a79644b8ad243a

here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$here/../../node_modules/.cache/gfm-oracle"
cache=$(cd "$here/../../node_modules/.cache/gfm-oracle" && pwd)
cmark="$cache/cmark-gfm-$version"

if [ ! -f "$cmark/build/src/libcmark-gfm.a" ]; then
	archive="$cache/cmark-gfm-$version.tar.gz"
	curl -fsSL -o "$archive" "https://github.com/github/cmark-gfm/archive/refs/tags/$version.tar.gz"
	actual=$(shasum -a 256 "$archive" | cut -d ' ' -f 1)
	if [ "$actual" != "$sha256" ]; then
		echo "Unexpected SHA-256 for $archive: $actual" >&2
		exit 1
	fi
	rm -rf "$cmark"
	tar -xzf "$archive" -C "$cache"
	# cmark-gfm declares a CMake minimum that CMake 4 no longer accepts. Its
	# own warnings are silenced: this build only needs the libraries.
	cmake -S "$cmark" -B "$cmark/build" -Wno-dev -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_C_FLAGS=-w >/dev/null
	cmake --build "$cmark/build" -j 8 >/dev/null
fi

cc -O2 "$here/batch.c" \
	-I "$cmark/src" -I "$cmark/build/src" -I "$cmark/extensions" -I "$cmark/build/extensions" \
	"$cmark/build/extensions/libcmark-gfm-extensions.a" "$cmark/build/src/libcmark-gfm.a" \
	-o "$cache/batch"
cc -O2 "$here/fold-scalars.c" \
	-I "$cmark/src" -I "$cmark/build/src" \
	"$cmark/build/src/libcmark-gfm.a" \
	-o "$cache/fold-scalars"

# The tagfilter extension escapes <title>, and CMARK_OPT_GITHUB_PRE_LANG
# writes lang.
check=$(printf '<!-- a -->\0x <title>\0```js\nx\n```\n' | "$cache/batch" | tr '\0\n' '|~')
expected='<!-- a -->~|<p>x &lt;title></p>~|<pre lang="js"><code>x~</code></pre>~|'
if [ "$check" != "$expected" ]; then
	echo "Unexpected oracle output: $check" >&2
	exit 1
fi
echo "Built $cache/batch and $cache/fold-scalars"

# The element stack reference: the gumbo that Nokogiri 1.13.8 vendors, with
# gumbo.patch applied, and gumbo-batch.c against it.
nokogiri=1.13.8
nokogiri_sha256=2dc0c94868e57e455943b09d3e9bf02fe7888516560083e5f951c0d1b814f8a2
gumbo="$cache/gumbo-nokogiri-$nokogiri"

archive="$cache/nokogiri-$nokogiri.tar.gz"
if [ ! -f "$archive" ]; then
	curl -fsSL -o "$archive.partial" "https://github.com/sparklemotion/nokogiri/archive/refs/tags/v$nokogiri.tar.gz"
	mv "$archive.partial" "$archive"
fi
actual=$(shasum -a 256 "$archive" | cut -d ' ' -f 1)
if [ "$actual" != "$nokogiri_sha256" ]; then
	echo "Unexpected SHA-256 for $archive: $actual" >&2
	exit 1
fi
# Extracted and patched on every run, so a changed gumbo.patch takes effect.
rm -rf "$gumbo"
mkdir -p "$gumbo"
tar -xzf "$archive" -C "$gumbo" --strip-components 3 "nokogiri-$nokogiri/gumbo-parser/src"
patch -s -p1 -d "$gumbo" < "$here/gumbo.patch"
cc -O2 -w -I "$gumbo" "$gumbo"/*.c "$here/gumbo-batch.c" -o "$cache/gumbo-batch"

check=$(printf '<svg><p><![CDATA[<!--a-->]]></svg><!--b--><menuitem><svg></menuitem><![CDATA[<!--c-->]]>' | "$cache/gumbo-batch" | tr '\0\036\037' '|~^')
expected='<!--b-->^b~|'
if [ "$check" != "$expected" ]; then
	echo "Unexpected gumbo output: $check" >&2
	exit 1
fi
echo "Built $cache/gumbo-batch"
