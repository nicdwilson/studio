import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { Button, TextControl, Card, SelectControl, CheckboxControl, Spinner } from '@wordpress/components';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getIpcApi } from 'src/lib/get-ipc-api';
import { useSiteDetails } from 'src/hooks/use-site-details';

interface PluginOption {
	label: string;
	value: string;
	type: 'public' | 'premium';
	repository?: string; // GitHub repository URL for premium plugins
}

// Common premium plugins that users frequently install
const COMMON_PREMIUM_PLUGINS: PluginOption[] = [
	{ label: 'WooCommerce Subscriptions', value: 'woocommerce-subscriptions', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
	{ label: 'WooCommerce Bookings', value: 'woocommerce-bookings', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
	{ label: 'WooCommerce Memberships', value: 'woocommerce-memberships', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
	{ label: 'WooCommerce Product Bundles', value: 'woocommerce-product-bundles', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
	{ label: 'WooCommerce Composite Products', value: 'woocommerce-composite-products', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
	{ label: 'WooCommerce Advanced Notifications', value: 'woocommerce-advanced-notifications', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
	{ label: 'WooCommerce Customer Order CSV Export', value: 'woocommerce-customer-order-csv-export', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
	{ label: 'WooCommerce Product CSV Import Suite', value: 'woocommerce-product-csv-import-suite', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
];

const COMMON_WOOCOMMERCE_PLUGINS: PluginOption[] = [
	{ label: 'WooCommerce', value: 'woocommerce', type: 'public' },
	{ label: 'WooCommerce Payments', value: 'woocommerce-payments', type: 'public' },
	{ label: 'WooCommerce Min/Max Quantities', value: 'woocommerce-min-max-quantities', type: 'public' },
	{ label: 'WooCommerce Name Your Price', value: 'woocommerce-name-your-price', type: 'public' },
	{ label: 'WooCommerce Product Add-ons', value: 'woocommerce-product-addons', type: 'public' },
	{ label: 'WooCommerce Checkout Add-ons', value: 'woocommerce-checkout-add-ons', type: 'public' },
	{ label: 'WooCommerce Deposits', value: 'woocommerce-deposits', type: 'public' },
	{ label: 'WooCommerce Conditional Shipping and Payments', value: 'woocommerce-conditional-shipping-and-payments', type: 'public' },
	{ label: 'WooCommerce Bulk Stock Management', value: 'woocommerce-bulk-stock-management', type: 'public' },
	{ label: 'WooCommerce Cost of Goods', value: 'woocommerce-cost-of-goods', type: 'public' },
	{ label: 'WooCommerce Order Barcodes', value: 'woocommerce-order-barcodes', type: 'public' },
	{ label: 'WooCommerce PDF Product Vouchers', value: 'woocommerce-pdf-product-vouchers', type: 'public' },
	{ label: 'WooCommerce Points and Rewards', value: 'woocommerce-points-and-rewards', type: 'public' },
	{ label: 'WooCommerce Product Vendors', value: 'woocommerce-product-vendors', type: 'public' },
	{ label: 'WooCommerce Shipment Tracking', value: 'woocommerce-shipment-tracking', type: 'public' },
	{ label: 'WooCommerce Shipping Per Product', value: 'woocommerce-shipping-per-product', type: 'public' },
	{ label: 'WooCommerce Table Rate Shipping', value: 'woocommerce-table-rate-shipping', type: 'public' },
	{ label: 'WooCommerce Waitlist', value: 'woocommerce-waitlist', type: 'public' },
	{ label: 'WooCommerce Wholesale Prices', value: 'woocommerce-wholesale-prices', type: 'public' },
];

export function WizardHatPluginManagement() {
	console.log('WIZARD HAT PLUGIN MANAGEMENT COMPONENT LOADED - TIMESTAMP:', Date.now());
	
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const { startServer, loadingServer } = useSiteDetails();
	const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
	const [installing, setInstalling] = useState(false);
	const [githubToken, setGithubToken] = useState('');
	const [tokenValid, setTokenValid] = useState(false);
	const [allPremiumPlugins, setAllPremiumPlugins] = useState<PluginOption[]>([]);
	const [loadingPremiumPlugins, setLoadingPremiumPlugins] = useState(false);
	const [installationLog, setInstallationLog] = useState<string[]>([]);
	const [searchTerm, setSearchTerm] = useState('');
	const [showSearchResults, setShowSearchResults] = useState(false);
	const searchRef = useRef<HTMLDivElement>(null);

	// Click outside handler to close search results
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
				setShowSearchResults(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, []);

	if (!selectedSite) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						{__('Plugin Management')}
					</h2>
					<p className="text-gray-600 mb-6">
						{__('Please select a site to manage plugins.')}
					</p>
				</div>
			</div>
		);
	}

	const isLoading = selectedSite?.id ? loadingServer[selectedSite.id] : false;

	useEffect(() => {
		// Load saved GitHub token
		const savedToken = localStorage.getItem('wizard-hat-github-token');
		if (savedToken) {
			setGithubToken(savedToken);
			validateToken(savedToken);
		}
	}, []);

	const validateToken = async (token: string) => {
		try {
			if (token.length === 0) {
				setTokenValid(false);
				return;
			}

			console.log('🚀🚀🚀 VALIDATING GITHUB TOKEN VIA IPC 🚀🚀🚀');
			
			// Use the new IPC handler for token validation
			const result = await getIpcApi().validateGitHubToken(token);
			
			console.log('🚀🚀🚀 TOKEN VALIDATION RESULT:', result);

			if (result.valid) {
				console.log('GitHub token validated for user:', result.user);
				setTokenValid(true);
				await loadPremiumPlugins(token);
			} else {
				console.error('GitHub token validation failed:', result.error);
				setTokenValid(false);
				setAllPremiumPlugins([]);
			}
		} catch (error) {
			console.error('Token validation error:', error);
			setTokenValid(false);
			setAllPremiumPlugins([]);
		}
	};

	const loadPremiumPlugins = async (token: string) => {
		setLoadingPremiumPlugins(true);
		try {
			console.log('🚀🚀🚀 LOADING PREMIUM PLUGINS FROM REPO 🚀🚀🚀');
			
			// Use the new IPC handler to fetch available premium plugins
			const result = await getIpcApi().getAvailablePremiumPlugins(token);
			
			if (result.success && result.plugins) {
				console.log('🚀🚀🚀 LOADED PREMIUM PLUGINS:', result.plugins.length);
				
				// Convert to PluginOption format
				const premiumOptions: PluginOption[] = result.plugins.map(plugin => ({
					label: plugin.label,
					value: plugin.name,
					type: 'premium' as const,
					repository: 'https://github.com/woocommerce/all-plugins'
				}));
				
				setAllPremiumPlugins(premiumOptions);
			} else {
				console.error('Failed to load premium plugins:', result.error);
				setAllPremiumPlugins([]);
			}
		} catch (error) {
			console.error('Error loading premium plugins:', error);
			setAllPremiumPlugins([]);
		} finally {
			setLoadingPremiumPlugins(false);
		}
	};

	const handleTokenChange = (token: string) => {
		setGithubToken(token);
		localStorage.setItem('wizard-hat-github-token', token);
		validateToken(token);
	};

	const togglePlugin = (pluginValue: string) => {
		setSelectedPlugins(prev => 
			prev.includes(pluginValue)
				? prev.filter(p => p !== pluginValue)
				: [...prev, pluginValue]
		);
	};

	// Filter premium plugins based on search term
	const filteredPremiumPlugins = useMemo(() => {
		if (searchTerm.length < 3) {
			return [];
		}
		
		const term = searchTerm.toLowerCase();
		return allPremiumPlugins
			.filter(plugin => 
				plugin.label.toLowerCase().includes(term) ||
				plugin.value.toLowerCase().includes(term)
			)
			.filter(plugin => !selectedPlugins.includes(plugin.value)) // Exclude already selected
			.slice(0, 10); // Limit to 10 results for better UX
	}, [searchTerm, allPremiumPlugins, selectedPlugins]);

	// Debounced search handler
	const handleSearchChange = useCallback((value: string) => {
		setSearchTerm(value);
		if (value.length >= 3) {
			setShowSearchResults(true);
		} else {
			setShowSearchResults(false);
		}
	}, []);

	const addPremiumPluginFromSearch = (pluginValue: string) => {
		if (!selectedPlugins.includes(pluginValue)) {
			setSelectedPlugins(prev => [...prev, pluginValue]);
			setSearchTerm(''); // Clear search
			setShowSearchResults(false);
		}
	};

	const removePlugin = (pluginValue: string) => {
		setSelectedPlugins(prev => prev.filter(p => p !== pluginValue));
	};

	const installSelectedPlugins = async () => {
		console.log('🚀🚀🚀 INSTALL SELECTED PLUGINS FUNCTION CALLED - NEW CODE VERSION 🚀🚀🚀');
		console.log('🚀🚀🚀 TIMESTAMP:', new Date().toISOString());
		console.log('🚀🚀🚀 SELECTED PLUGINS:', selectedPlugins);
		
		if (selectedPlugins.length === 0 || installing) return;

		setInstalling(true);
		setInstallationLog([]);

		try {
			// Ensure site is running
			if (!selectedSite.running) {
				await startServer(selectedSite.id);
			}

			const allPlugins = [...COMMON_WOOCOMMERCE_PLUGINS, ...allPremiumPlugins];
			const pluginsToInstall = allPlugins.filter(plugin => selectedPlugins.includes(plugin.value));
			
			console.log('🚀🚀🚀 PLUGINS TO INSTALL:', pluginsToInstall);
			
			const results = {
				success: [] as string[],
				failed: [] as { plugin: string; error: string }[]
			};

			// Install each plugin
			for (const plugin of pluginsToInstall) {
				try {
					setInstallationLog(prev => [...prev, `Installing ${plugin.label}...`]);
					
					if (plugin.type === 'premium') {
						console.log('🚀🚀🚀 PREMIUM PLUGIN DETECTED - USING NEW CODE PATH 🚀🚀🚀');
						console.log('🚀🚀🚀 PLUGIN:', plugin.label);
						console.log('🚀🚀🚀 REPOSITORY:', plugin.repository);
						
						// Handle premium plugins from private repositories
						if (!githubToken) {
							throw new Error('GitHub token required for premium plugins');
						}

						console.log(`[Wizard Hat Frontend] Installing premium plugin: ${plugin.label}`);
						console.log(`[Wizard Hat Frontend] Repository: ${plugin.repository}`);
						console.log(`[Wizard Hat Frontend] Site ID: ${selectedSite.id}`);

						// Use the new IPC handler for private repository installation
						try {
							console.log(`[Wizard Hat Frontend] About to call installPluginFromPrivateRepo`);
							const result = await getIpcApi().installPluginFromPrivateRepo({
								siteId: selectedSite.id,
								repositoryUrl: plugin.repository!,
								githubToken,
								pluginName: plugin.value,
							});
							console.log(`[Wizard Hat Frontend] Installation result:`, result);

							if (!result.success) {
								throw new Error(result.error || 'Failed to install premium plugin');
							}

							results.success.push(plugin.label);
							setInstallationLog(prev => [...prev, `✅ ${plugin.label} installed successfully`]);
						} catch (error) {
							console.error(`[Wizard Hat Frontend] Error installing premium plugin ${plugin.label}:`, error);
							results.failed.push({ plugin: plugin.label, error: error instanceof Error ? error.message : String(error) });
							setInstallationLog(prev => [...prev, `❌ ${plugin.label} failed: ${error instanceof Error ? error.message : String(error)}`]);
						}
					} else {
						console.log('🚀🚀🚀 PUBLIC PLUGIN - USING OLD CODE PATH 🚀🚀🚀');
						console.log('🚀🚀🚀 PLUGIN:', plugin.label);
						
						// Handle public plugins with the original method
						const result = await getIpcApi().executeWPCLiInline({
							siteId: selectedSite.id,
							args: `plugin install ${plugin.value} --activate`,
						});

						if (result.exitCode === 0) {
							results.success.push(plugin.label);
							setInstallationLog(prev => [...prev, `✅ ${plugin.label} installed successfully`]);
						} else {
							results.failed.push({ plugin: plugin.label, error: result.stderr });
							setInstallationLog(prev => [...prev, `❌ ${plugin.label} failed: ${result.stderr}`]);
						}
					}
				} catch (error) {
					console.error(`Error installing ${plugin.label}:`, error);
					results.failed.push({ plugin: plugin.label, error: error instanceof Error ? error.message : String(error) });
					setInstallationLog(prev => [...prev, `❌ ${plugin.label} failed: ${error instanceof Error ? error.message : String(error)}`]);
				}
			}

			// Show final results
			if (results.success.length > 0) {
				setInstallationLog(prev => [...prev, `\n✅ Successfully installed: ${results.success.join(', ')}`]);
			}
			if (results.failed.length > 0) {
				setInstallationLog(prev => [...prev, `\n❌ Failed to install: ${results.failed.map(f => f.plugin).join(', ')}`]);
			}
		} catch (error) {
			console.error('Error during plugin installation:', error);
			setInstallationLog(prev => [...prev, `❌ Installation failed: ${error instanceof Error ? error.message : String(error)}`]);
		} finally {
			setInstalling(false);
		}
	};

	const installWooCommercePaymentsDevTools = async () => {
		setInstalling(true);

		try {
			// Ensure site is running
			if (!selectedSite.running) {
				await startServer(selectedSite.id);
			}

			// Install WooCommerce Payments Dev Tools
			await getIpcApi().executeWPCLiInline({
				siteId: selectedSite.id,
				args: 'plugin install https://github.com/Automattic/woocommerce-payments-dev-tools/archive/refs/heads/trunk.zip --activate --force',
			});

			// Set dev tool options
			const devOptions = [
				'wcpaydev_proxy false',
				'wcpaydev_redirect false',
				'wcpaydev_redirect_localhost false',
				'wcpaydev_display_notice true',
			];

			for (const option of devOptions) {
				await getIpcApi().executeWPCLiInline({
					siteId: selectedSite.id,
					args: `option set ${option}`,
				});
			}

			getIpcApi().showNotification({
				title: __('Success'),
				body: __('WooCommerce Payments Dev Tools installed successfully'),
			});
		} catch (error) {
			console.error('Error installing dev tools:', error);
			getIpcApi().showErrorMessageBox({
				title: __('Error'),
				message: __('Failed to install WooCommerce Payments Dev Tools. Please try again.'),
				error,
			});
		} finally {
			setInstalling(false);
		}
	};

	return (
		<div className="space-y-8">
			<div className="max-w-3xl">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">
					{__('Plugin Management')}
				</h2>
				<p className="text-gray-600 mb-6">
					{__('Install and manage WooCommerce plugins, including premium plugins from private repositories.')}
				</p>
			</div>

			{/* GitHub Token Section */}
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{__('GitHub Token (for Premium Plugins)')}
				</h3>
				<p className="text-gray-600 mb-4">
					{__('Some plugins require access to private GitHub repositories. Enter your GitHub token with "repo" scope to access premium plugins.')}
				</p>
				<div className="flex gap-4 items-end">
					<TextControl
						type="password"
						label={__('GitHub Token')}
						value={githubToken}
						onChange={handleTokenChange}
						placeholder="ghp_..."
						className="flex-1"
					/>
					<Button
						variant="secondary"
						onClick={() => getIpcApi().openURL('https://github.com/settings/tokens/new')}
					>
						{__('Create Token')}
					</Button>
				</div>
				{tokenValid && (
					<p className="text-green-600 text-sm mt-2">
						{__('✓ Token is valid')}
					</p>
				)}
			</Card>

			{/* Quick Install Section */}
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{__('Quick Install')}
				</h3>
				<div className="space-y-4">
					<Button
						variant="primary"
						onClick={installWooCommercePaymentsDevTools}
						disabled={isLoading || installing}
					>
						{installing ? __('Installing...') : __('Install WooCommerce Payments Dev Tools')}
					</Button>
				</div>
			</Card>

			{/* Plugin Selection Section */}
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{__('Select Plugins to Install')}
				</h3>
				
				{/* Common Public Plugins */}
				<div className="mb-6">
					<h4 className="text-md font-medium text-gray-700 mb-3">
						{__('Common WooCommerce Plugins (Public)')}
					</h4>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
						{COMMON_WOOCOMMERCE_PLUGINS.map((plugin) => (
							<CheckboxControl
								key={plugin.value}
								label={plugin.label}
								checked={selectedPlugins.includes(plugin.value)}
								onChange={() => togglePlugin(plugin.value)}
							/>
						))}
					</div>
				</div>

				{/* Common Premium Plugins */}
				{tokenValid && (
					<div className="mb-6">
						<h4 className="text-md font-medium text-gray-700 mb-3">
							{__('Common Premium Plugins')}
						</h4>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
							{COMMON_PREMIUM_PLUGINS.map((plugin) => (
								<CheckboxControl
									key={plugin.value}
									label={plugin.label}
									checked={selectedPlugins.includes(plugin.value)}
									onChange={() => togglePlugin(plugin.value)}
								/>
							))}
						</div>
					</div>
				)}

				{/* All Premium Plugins Search */}
				{tokenValid && (
					<div className="mb-6" ref={searchRef}>
						<h4 className="text-md font-medium text-gray-700 mb-3">
							{__('Search Premium Plugins')}
						</h4>
						<div className="space-y-3">
							<div className="flex gap-2">
								<TextControl
									label={__('Search plugins (type 3+ characters)')}
									value={searchTerm}
									onChange={handleSearchChange}
									placeholder={__('Search for premium plugins...')}
									disabled={loadingPremiumPlugins}
									onFocus={() => {
										if (searchTerm.length >= 3) {
											setShowSearchResults(true);
										}
									}}
									className="flex-1"
								/>
								{searchTerm.length > 0 && (
									<Button
										variant="tertiary"
										onClick={() => {
											setSearchTerm('');
											setShowSearchResults(false);
										}}
										className="self-end"
									>
										{__('Clear')}
									</Button>
								)}
							</div>
							
							{/* Search Results */}
							{showSearchResults && (
								<div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto bg-white shadow-lg">
									{filteredPremiumPlugins.length > 0 ? (
										<div className="divide-y divide-gray-100">
											{filteredPremiumPlugins.map((plugin) => (
												<div
													key={plugin.value}
													className="flex items-center justify-between p-3 hover:bg-blue-50 cursor-pointer transition-colors"
													onClick={() => addPremiumPluginFromSearch(plugin.value)}
												>
													<div className="flex-1">
														<div className="font-medium text-gray-900">{plugin.label}</div>
														<div className="text-sm text-gray-500">{plugin.value}</div>
													</div>
													<Button
														variant="tertiary"
														size="small"
														onClick={(e: React.MouseEvent) => {
															e.stopPropagation();
															addPremiumPluginFromSearch(plugin.value);
														}}
													>
														{__('Add')}
													</Button>
												</div>
											))}
										</div>
									) : searchTerm.length >= 3 ? (
										<div className="p-4 text-center text-gray-500">
											{__('No plugins found matching your search.')}
										</div>
									) : null}
								</div>
							)}
							
							{loadingPremiumPlugins && (
								<div className="flex items-center gap-2 text-sm text-gray-600">
									<Spinner />
									{__('Loading premium plugins...')}
								</div>
							)}
							
							{!loadingPremiumPlugins && allPremiumPlugins.length > 0 && (
								<div className="text-sm text-gray-500">
									{__('Available premium plugins:')} {allPremiumPlugins.length}
								</div>
							)}
						</div>
					</div>
				)}

				{/* Selected Plugins List */}
				{selectedPlugins.length > 0 && (
					<div className="mb-6">
						<h4 className="text-md font-medium text-gray-700 mb-3">
							{__('Selected Plugins')} ({selectedPlugins.length})
						</h4>
						<div className="space-y-2">
							{selectedPlugins.map((pluginValue) => {
								const allPlugins = [...COMMON_WOOCOMMERCE_PLUGINS, ...COMMON_PREMIUM_PLUGINS, ...allPremiumPlugins];
								const plugin = allPlugins.find(p => p.value === pluginValue);
								return (
									<div key={pluginValue} className="flex items-center justify-between p-2 bg-gray-50 rounded">
										<span className="text-sm">
											{plugin?.label || pluginValue}
											{plugin?.type === 'premium' && (
												<span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
													{__('Premium')}
												</span>
											)}
										</span>
										<Button
											variant="tertiary"
											onClick={() => removePlugin(pluginValue)}
											className="text-red-600 hover:text-red-800"
										>
											{__('Remove')}
										</Button>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* Install Button */}
				<div className="flex justify-between items-center">
					<Button
						variant="primary"
						onClick={installSelectedPlugins}
						disabled={selectedPlugins.length === 0 || installing || isLoading}
					>
						{installing ? __('Installing...') : __('Install Selected Plugins')}
					</Button>
					
					{selectedPlugins.length > 0 && (
						<Button
							variant="tertiary"
							onClick={() => setSelectedPlugins([])}
							disabled={installing}
						>
							{__('Clear All')}
						</Button>
					)}
				</div>
			</Card>

			{/* Information Section */}
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
				<h3 className="text-lg font-medium text-blue-900 mb-2">
					{__('Plugin Information')}
				</h3>
				<ul className="text-blue-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('Plugins will be installed and activated automatically')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('Premium plugins require a valid GitHub token with "repo" scope')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('WooCommerce Payments Dev Tools enables local payment testing')}</span>
					</li>
				</ul>
			</div>

			{/* Installation Log Section */}
			{installationLog.length > 0 && (
				<Card className="p-6">
					<h3 className="text-lg font-medium text-gray-900 mb-4">
						{__('Installation Log')}
					</h3>
					<div className="bg-gray-50 border rounded-lg p-4 max-h-64 overflow-y-auto">
						{installationLog.map((log, index) => (
							<div key={index} className="text-sm font-mono mb-1">
								{log}
							</div>
						))}
					</div>
				</Card>
			)}
		</div>
	);
} 