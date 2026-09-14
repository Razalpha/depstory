# depstory

[![CI](https://github.com/Razalpha/depstory/actions/workflows/ci.yml/badge.svg)](https://github.com/Razalpha/depstory/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933)](package.json)
[![MIT lisansı](https://img.shields.io/badge/lisans-MIT-blue.svg)](LICENSE)

`package.json` bir projenin hangi paketlere bağlı olduğunu gösterir. `depstory`
ise Git geçmişiyle güncel importları bir araya getirerek paketin ne zaman
eklendiğini, o commit'in ne söylediğini ve bugün hangi dosyalarda kullanıldığını
gösterir.

[English README](README.md)

```text
$ npx --yes github:Razalpha/depstory zod

demo-api — 1 dependency declaration across 1 manifest

zod ^4.0.0 (dependencies)
  introduced 2026-09-14 in 68d9f4a1: validate incoming requests
  used by 2 file(s): src/api.ts, src/schema.ts
```

Bu komut, tanımadığınız bir depoyu incelerken, bir paketin kaldırılıp
kaldırılamayacağını araştırırken veya sürüm yükseltmeden önce paketin eklenme
gerekçesini bulurken işe yarar. Depoyu olduğu yerde ve salt okunur biçimde
inceler; bağımlılık kurmaz, proje kodunu çalıştırmaz.

## Çalıştırma

Node.js 20 veya daha yenisi ile Git gerekir. Paket şimdilik doğrudan bu depodan
çalıştırılır:

```bash
npx --yes github:Razalpha/depstory
npx --yes github:Razalpha/depstory react
npx --yes github:Razalpha/depstory --workspace packages/web
npx --yes github:Razalpha/depstory --markdown
npx --yes github:Razalpha/depstory --json
npx --yes github:Razalpha/depstory zod --cwd ../baska-proje
```

Sık kullanım için:

```bash
npm install --global github:Razalpha/depstory
depstory --help
```

## Ne gösterir?

depstory; `dependencies`, `devDependencies`, `peerDependencies` ve
`optionalDependencies` bölümlerindeki her kayıt için:

1. ilgili `package.json` geçmişinde paket adını ekleyen ilk commit'i arar;
2. JavaScript, TypeScript, Vue ve Svelte dosyalarındaki doğrudan ESM, dinamik
   import, yeniden dışa aktarma ve CommonJS kullanımlarını tarar;
3. bulguları terminal metni, Markdown veya sürümlü JSON olarak verir.

Kaynak dosyalar her çalıştırmada bir kez taranır. Yorumlar, sıradan metinler,
şablon metinleri, derleme çıktıları, bağımlılık klasörleri, sembolik bağlantılar
ve 1 MiB'tan büyük dosyalar atlanır.

## Monorepo desteği

Kök `package.json` içindeki `*`, `**`, `?` ve hariç tutma ifadelerini kullanan
yaygın workspace desenleri otomatik bulunur. Hem dizi biçimi hem de
`workspaces.packages` biçimi desteklenir. Raporu paket adına veya depo içindeki
göreli yoluna göre daraltabilirsiniz:

```bash
depstory --workspace @acme/web
depstory react --workspace packages/web
```

Kullanım dosyaları seçilen workspace ile sınırlandırılır. Kök bağımlılıklar ortak
betikler ve araçlar tarafından kullanılabileceği için tüm depoda aranır.

## Sonucu yorumlarken

Rapor bir karar değil, inceleme kanıtıdır. Doğrudan import bulunmaması paketin
kesinlikle kullanılmadığı anlamına gelmez; komut satırı araçları, yükleyiciler,
framework eklentileri ve yapılandırma dosyaları kaynak importlarında görünmeyebilir.
Sığ klonlarda ilk commit bulunmayabilir; depstory bu durumu çıktıda açıkça belirtir.

Git taraması manifestin bugünkü yolunu izler. Manifestin adı veya yeri değiştiyse
bu değişiklikten daha eski kayıtlar için Git üzerinde ayrıca inceleme gerekebilir.

JSON alanları ve uyumluluk kuralları [docs/json-output.md](docs/json-output.md)
dosyasında açıklanır.

## Geliştirme

```bash
npm run check
npm test
npm run coverage
npm pack --dry-run
```

Çalışma zamanı bağımlılığı yoktur ve testler ağ bağlantısı istemez. Ayrıştırıcıya
yeni davranış eklerken eksik sözdizimini gösteren küçük bir fixture da ekleyin.
Ayrıntılı akış için [CONTRIBUTING.md](CONTRIBUTING.md), katkıya açık işler için
[ROADMAP.md](ROADMAP.md) dosyasına bakın.

## Lisans

[MIT](LICENSE)
