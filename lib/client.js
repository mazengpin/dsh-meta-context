window.__ModuleLoader__.load({
	id: "dsh-meta-context",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		// src/shared/protocol.ts
		/**
		* The wire contract shared by both halves of dsh-meta-context, and the
		* authority on every route body and on the capability registry the parity
		* count is taken over.
		*
		* This module is the ONLY shared code between the Host half and the browser
		* half, and it imports nothing at all — not a Node builtin, not `react`, not
		* another plugin. That is deliberate: the browser bundle inlines this file, so
		* an import here would either leak a Node builtin into the module-loader
		* factory or add a module-table edge, and the client build's purity gate
		* rejects both.
		*
		* THE THREE STATUSES, AND WHY THERE ARE THREE RATHER THAN TWO
		*
		* D-0352 rule (2) makes capability parity — not route count — the acceptance
		* test, and rule (4) forbids publishing a number the surface cannot derive. A
		* two-valued PASS/FAIL vocabulary cannot express "the member still owns this
		* capability, its registration is cited, and the fused surface publishes it but
		* does not re-render it", so this contract names three:
		*
		*  - `driven`    the fused surface reproduces the capability itself, deriving
		*                the answer live from the member (a composed route call or a
		*                cordis service call). An HTTP probe proves it.
		*  - `attested`  the capability is a seat the member's OWN client bundle
		*                registers (a slot, a trigger, a projection definition). The
		*                fused surface publishes the exact registration with its
		*                member `file:line` and proves the member is mounted; it does
		*                not re-render another plugin's React tree, because that tree
		*                is closed inside that plugin's client artifact and copying it
		*                would be the fork D-0352 rule (1) forbids.
		*  - `unmeasured` the capability exists and the fused surface CANNOT reproduce
		*                it. It is reported with a `reason` and is never counted as a
		*                pass, never rendered as a zero, and never omitted.
		*
		* A `0/0` registry is BLINDED: `parityVerdict` returns `BLINDED` and the
		* harness exits non-zero. This program has published `0` from instruments that
		* could not see their subject; the guard is the denominator.
		*
		* @module dsh-meta-context/shared/protocol
		*/
		/**
		* The prefix this plugin's own routes are mounted under, WITHOUT a leading
		* slash. The Client resolves it against the page base (so the plugin keeps
		* working behind a reverse-proxy prefix); the Host adds the slash when it
		* registers, because the web server's prefix table matches absolute pathnames.
		*/
		const ROUTE_PREFIX = "meta-context/api";
		/** The keyed `main` slot this plugin's page is registered under. Never `dsh-context`'s. */
		const PANEL_ID = "dsh-meta-context";
		/**
		* The `sidebar.panellist` row id. Distinct from every member's own row id
		* (`dsh-context` is the only member that owns one), because a duplicate id in a
		* keyed slot would either throw at load or silently replace the member's row.
		*/
		const SIDEBAR_ID = "dsh-meta-context";
		/** The locale namespace both halves register under. */
		const LOCALE_NS = "meta-context";
		// src/client/api.ts
		/**
		* The Client half's transport.
		*
		* One route family, resolved against the PAGE BASE rather than written as an
		* absolute path, so the plugin keeps working when the app is served under a
		* reverse-proxy prefix. The page's query and hash are dropped before resolution.
		*
		* A failure is TYPED rather than collapsed into one boolean, because the page has
		* to distinguish "the fused route rejected this body" (400) from "the fused route
		* is not mounted" (404) — the second is a deployment fact the owner needs to see
		* as a fact, not as an empty list. Nothing here reads a Node builtin or another
		* plugin: `shared/protocol.ts` is inlined because it imports nothing at all.
		*
		* @module dsh-meta-context/client/api
		*/
		/** Placeholder origin for the non-DOM case (specs, SSR): resolution needs an absolute base. */
		const PLACEHOLDER_ORIGIN = "http://dsh.invalid/";
		/** A typed failure from the fused route. */
		var MetaContextError = class extends Error {
			failure;
			constructor(failure, message) {
				super(message);
				this.failure = failure;
				this.name = "MetaContextError";
			}
		};
		/** The failure kind matching one HTTP status. */
		function failureFor(status) {
			if (status === 400) return "rejected";
			if (status === 404) return "not-mounted";
			return "unreachable";
		}
		/** Turn any page base into a directory base, so a relative route resolves inside it. */
		function directoryBase(baseUrl) {
			const url = new URL(baseUrl === "" ? PLACEHOLDER_ORIGIN : baseUrl, PLACEHOLDER_ORIGIN);
			url.search = "";
			url.hash = "";
			if (!url.pathname.endsWith("/")) url.pathname += "/";
			return url.href;
		}
		/**
		* Resolve one fused route against the page base.
		* @param tail - the route tail without a leading slash (`''` for the index).
		* @returns the absolute route URL, page prefix included.
		*/
		function routeUrl(tail) {
			const base = typeof document === "undefined" ? PLACEHOLDER_ORIGIN : document.baseURI;
			const path = tail === "" ? ROUTE_PREFIX : `${ROUTE_PREFIX}/${tail}`;
			return new URL(path.replace(/^\/+/, ""), directoryBase(base));
		}
		/** One GET against a fused route, returning the parsed body. */
		async function read(tail) {
			let response;
			try {
				response = await fetch(routeUrl(tail), {
					headers: { accept: "application/json" },
					cache: "no-store"
				});
			} catch (error) {
				throw new MetaContextError("unreachable", error instanceof Error ? error.message : String(error));
			}
			if (!response.ok) throw new MetaContextError(failureFor(response.status), `the fused route answered ${response.status}`);
			return await response.json();
		}
		/**
		* Read the fused index.
		* @returns the index payload.
		*/
		async function readIndex() {
			return await read("");
		}
		/**
		* Read the capability registry.
		* @returns the parity payload.
		*/
		async function readParity() {
			return await read("parity");
		}
		// src/client/MetaContextPage.tsx
		/**
		* The fused context page — the panel behind the ONE sidebar entry.
		*
		* WHAT IT RENDERS, AND WHY IT IS THIS AND NOT A COPY OF THE MEMBERS
		*
		* It does not re-render any member's view. `dsh-context`'s dashboard, the
		* controller's composer dropdown and the stats page are React trees closed
		* inside their own client artifacts; reaching into them would mean copying
		* their source, which is the fork D-0352 rule (1) forbids and rule (3) makes
		* unnecessary — the members stay loaded and keep their own seats.
		*
		* What this page adds is the thing the owner actually asked for: ONE place that
		* says what the family is, which capability lives where, what this surface
		* reproduces itself, and what it does not. Every count is printed WITH its
		* denominator, and every UNMEASURED row is printed with its reason — never
		* dropped, never rendered as a zero, never hidden behind a spinner that never
		* resolves.
		*
		* A failed read is shown as a failed read. There is no branch that renders an
		* empty table over a transport error, because an empty table and an unread
		* surface look identical to a reader and mean opposite things.
		*
		* @module dsh-meta-context/client/MetaContextPage
		*/
		/** Shared style tokens, so the page needs no stylesheet and no CSS module. */
		const S = {
			root: {
				padding: "16px",
				font: "13px/1.5 system-ui, sans-serif",
				color: "inherit",
				overflow: "auto"
			},
			h1: {
				font: "600 16px/1.4 system-ui, sans-serif",
				margin: "0 0 4px"
			},
			h2: {
				font: "600 13px/1.4 system-ui, sans-serif",
				margin: "20px 0 6px"
			},
			intro: {
				opacity: .75,
				margin: "0 0 12px"
			},
			table: {
				borderCollapse: "collapse",
				width: "100%"
			},
			th: {
				textAlign: "left",
				padding: "4px 8px",
				borderBottom: "1px solid rgba(127,127,127,.35)",
				fontWeight: 600
			},
			td: {
				padding: "4px 8px",
				borderBottom: "1px solid rgba(127,127,127,.15)",
				verticalAlign: "top"
			},
			num: {
				textAlign: "right",
				fontVariantNumeric: "tabular-nums"
			},
			pill: {
				display: "inline-block",
				padding: "0 6px",
				borderRadius: "9px",
				border: "1px solid currentColor",
				fontSize: "11px"
			},
			muted: { opacity: .7 },
			row: {
				display: "flex",
				gap: "12px",
				alignItems: "baseline",
				flexWrap: "wrap"
			},
			button: {
				font: "inherit",
				padding: "2px 10px",
				borderRadius: "5px",
				border: "1px solid currentColor",
				background: "transparent",
				cursor: "pointer",
				color: "inherit"
			}
		};
		/**
		* Render the fused context page.
		* @param props - the injected session id and translate function.
		* @returns the page.
		*/
		function MetaContextPage(props) {
			const t = props.t;
			const [state, setState] = (0, react.useState)({ kind: "loading" });
			const [nonce, setNonce] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				let live = true;
				setState({ kind: "loading" });
				Promise.all([readIndex(), readParity()]).then(([index, parity]) => {
					if (live) setState({
						kind: "ready",
						index,
						parity
					});
				}).catch((error) => {
					if (!live) return;
					const failure = error.failure ?? "unreachable";
					setState({
						kind: "failed",
						failure,
						message: error instanceof Error ? error.message : String(error)
					});
				});
				return () => {
					live = false;
				};
			}, [nonce]);
			const refresh = (0, react.useCallback)(() => {
				setNonce((value) => value + 1);
			}, []);
			if (state.kind === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: S.root,
				children: t("loading")
			});
			if (state.kind === "failed") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: S.root,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
						style: S.h1,
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						style: {
							...S.intro,
							color: "#c0392b"
						},
						children: [
							t("failed"),
							" — ",
							state.failure,
							": ",
							state.message
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: S.button,
						onClick: refresh,
						children: t("refresh")
					})
				]
			});
			const { index, parity } = state;
			const census = parity.census;
			const unreasoned = parity.capabilities.filter((row) => row.status === "unmeasured" && (row.reason === void 0 || row.reason.trim() === ""));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: S.root,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
						style: S.h1,
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: S.intro,
						children: t("intro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: S.row,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("verdict") }),
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: S.pill,
									children: index.verdict
								})
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: S.muted,
								children: [
									t("censusAt"),
									": ",
									index.censusAt
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: S.button,
								onClick: refresh,
								children: t("refresh")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: S.h2,
						children: t("parity")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						style: S.intro,
						children: [
							`${census.driven + census.attested + census.unmeasured}/${census.total}`,
							` · ${t("driven")} ${census.driven} · ${t("attested")} ${census.attested} · ${t("unmeasured")} ${census.unmeasured}`,
							unreasoned.length === 0 ? "" : ` · ${t("noReason")}: ${unreasoned.length}`
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
						style: S.table,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: S.th,
								children: t("members")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: {
									...S.th,
									...S.num
								},
								children: t("total")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: {
									...S.th,
									...S.num
								},
								children: t("driven")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: {
									...S.th,
									...S.num
								},
								children: t("attested")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: {
									...S.th,
									...S.num
								},
								children: t("unmeasured")
							})
						] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: parity.byMember.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: S.td,
								children: row.member
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: {
									...S.td,
									...S.num
								},
								children: row.total
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: {
									...S.td,
									...S.num
								},
								children: row.driven
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: {
									...S.td,
									...S.num
								},
								children: row.attested
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: {
									...S.td,
									...S.num
								},
								children: row.unmeasured
							})
						] }, row.member)) })]
					}),
					parity.capabilities.filter((row) => row.status === "unmeasured").length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: S.h2,
						children: t("unmeasured")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("table", {
						style: S.table,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: parity.capabilities.filter((row) => row.status === "unmeasured").map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
							style: S.td,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: row.id }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: S.muted,
									children: `${row.member} · ${row.file}:${row.line}`
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
							style: S.td,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("reason") }),
								" ",
								row.reason === void 0 || row.reason.trim() === "" ? t("noReason") : row.reason
							]
						})] }, row.id)) })
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: S.h2,
						children: t("members")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("table", {
						style: S.table,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: index.members.map((member) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: S.td,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: member.name })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: S.td,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: S.muted,
								children: member.role
							})
						})] }, member.name)) })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: S.h2,
						children: t("excluded")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("table", {
						style: S.table,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: index.excluded.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: S.td,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: row.name })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
							style: S.td,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: row.reason }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: S.muted,
									children: row.evidence
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: S.muted,
									children: `↻ ${row.reopenIf}`
								})
							]
						})] }, row.name)) })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: S.h2,
						children: t("routes")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("table", {
						style: S.table,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: index.routes.map((path) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: S.td,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: path })
						}) }, path)) })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: S.h2,
						children: t("sidebar")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: S.intro,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: `${index.sidebar.slot} · id=${index.sidebar.id} · order=${index.sidebar.order} · panel=${index.sidebar.panel}` })
					})
				]
			});
		}
		// src/client/locales.ts
		/** English dictionary. */
		const en = {
			nav: "Context",
			title: "Fused context surface",
			intro: "One entry for the context family. Every number below names the plugin that owns it.",
			members: "Members",
			parity: "Capability parity",
			driven: "reproduced here",
			attested: "owned by the member",
			unmeasured: "unmeasured",
			total: "total",
			verdict: "Verdict",
			excluded: "Considered and not fused",
			routes: "Routes",
			censusAt: "Census",
			reason: "Reason",
			noReason: "no reason recorded",
			refresh: "Refresh",
			loading: "Reading the fused surface…",
			failed: "The fused route did not answer",
			sidebar: "Sidebar seat",
			empty: "Nothing to show yet."
		};
		/** Chinese dictionary. */
		const zh = {
			nav: "上下文",
			title: "融合上下文界面",
			intro: "上下文家族的统一入口。以下每个数字都标明所属插件。",
			members: "成员",
			parity: "能力对等",
			driven: "此处复现",
			attested: "由成员持有",
			unmeasured: "未测量",
			total: "合计",
			verdict: "结论",
			excluded: "已考虑但未融合",
			routes: "路由",
			censusAt: "普查时间",
			reason: "原因",
			noReason: "未记录原因",
			refresh: "刷新",
			loading: "正在读取融合界面…",
			failed: "融合路由未响应",
			sidebar: "侧边栏位置",
			empty: "暂无可显示内容。"
		};
		// src/client/index.tsx
		/**
		* Client half of dsh-meta-context.
		*
		* TWO registrations, and the count is the deliverable.
		*
		* The owner's complaint is that the left sidebar carries several entries doing
		* the same work. The members keep their own seats — D-0352 rule (3) forbids
		* unregistering them while the fusion is unproven — but the family gains ONE
		* entry that fronts all of them:
		*
		*  1. this plugin's dictionaries in the shared locale service;
		*  2. ONE `sidebar.panellist` row, id `dsh-meta-context`, order 12;
		*  3. ONE keyed `main` panel, key `dsh-meta-context`.
		*
		* THE IDS AND THE KIND ARE THE ACCEPTANCE CONDITION, NOT A DETAIL
		*
		* Both ids are this plugin's own and match no member's: `dsh-context` owns the
		* sidebar id `dsh-context` and the main key `dsh-context`
		* (`dsh-context/src/client/insightPage.ts:15-18,36,40`), so reusing either would
		* either throw at load or silently replace the member's row. Nothing here
		* registers a `conversation.view` entry and nothing here passes a `priority` of
		* `builtin`: an extension-band contributor that takes a builtin kind can hide the
		* workbench, and this plugin has no business owning a conversation band. The
		* verify harness asserts both facts against the BUILT bundle, so neither can
		* regress silently.
		*
		* The seats go through `ctx.slots.inject` because `main` and `sidebar.panellist`
		* are declared by other packages: injecting waits for the real declaration
		* instead of racing it, disappears when it collapses, and is reinstalled if it
		* returns. A bare `slots.register` into an undeclared slot would throw at load.
		*
		* @module dsh-meta-context/client
		*/
		/** Loader row name; the Client bundle registers itself under this same id. */
		const name = "dsh-meta-context";
		/** The two Client services this half reads. */
		const inject = ["slots", "locale"];
		/** The list slot the sidebar row goes into. */
		const SIDEBAR_SLOT = "sidebar.panellist";
		/** The keyed slot the page goes into. */
		const PANEL_SLOT = "main";
		/**
		* The sidebar row glyph: a bracket wrapping three stacked bars, which reads as
		* "one surface over several members". Sized from the slot's own prop when the
		* shell supplies one, so the row matches its neighbours.
		*/
		function MetaContextIcon(props) {
			const size = typeof props.size === "number" ? props.size : 16;
			return (0, react.createElement)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round",
				"aria-hidden": true
			}, (0, react.createElement)("path", { d: "M5.5 2.5H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 13.5h1.5" }), (0, react.createElement)("path", { d: "M10.5 2.5H12A1.5 1.5 0 0 1 13.5 4v8a1.5 1.5 0 0 1-1.5 1.5h-1.5" }), (0, react.createElement)("path", { d: "M7 5.5h2M7 8h2M7 10.5h2" }));
		}
		/**
		* Register the dictionaries, the sidebar row and the page.
		* @param ctx - the Client plugin context (slots, locale, effect, logger).
		*/
		function apply(ctx) {
			ctx.effect(() => {
				const offZh = ctx.locale.register(LOCALE_NS, "zh", zh);
				const offEn = ctx.locale.register(LOCALE_NS, "en", en);
				return () => {
					offZh();
					offEn();
				};
			}, "dsh-meta-context: dictionaries");
			const t = ctx.locale.bind(LOCALE_NS);
			ctx.slots.inject(PANEL_SLOT, () => ctx.slots.register({
				name: PANEL_SLOT,
				key: PANEL_ID,
				locale: LOCALE_NS,
				registrant: "dsh-meta-context"
			}, MetaContextPage));
			ctx.slots.inject(SIDEBAR_SLOT, () => ctx.slots.register({
				name: SIDEBAR_SLOT,
				id: SIDEBAR_ID,
				order: 12,
				label: () => t("nav"),
				locale: LOCALE_NS,
				registrant: "dsh-meta-context"
			}, (props) => (0, react.createElement)(MetaContextIcon, { size: typeof props.size === "number" ? props.size : void 0 })));
		}
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map