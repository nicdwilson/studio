import { serializePlugins, serializeForWordPress } from 'src/lib/serialize-plugins';

describe( 'serializePlugins', () => {
	it( 'should correctly serialize an empty array', () => {
		const result = serializePlugins( [] );
		expect( result ).toBe( 'a:0:{}' );
	} );

	it( 'should correctly serialize an array with one plugin', () => {
		const result = serializePlugins( [ 'hello-dolly' ] );
		expect( result ).toBe( 'a:1:{i:0;s:11:"hello-dolly";}' );
	} );

	it( 'should correctly serialize an array with multiple plugins', () => {
		const plugins = [ 'akismet', 'jetpack', 'woocommerce', 'classc-editor' ];
		const result = serializePlugins( plugins );
		expect( result ).toBe(
			'a:4:{i:0;s:7:"akismet";i:1;s:7:"jetpack";i:2;s:11:"woocommerce";i:3;s:13:"classc-editor";}'
		);
	} );
} );

describe( 'serializeForWordPress', () => {
	it( 'should correctly serialize an empty array', () => {
		const result = serializeForWordPress( [] );
		expect( result ).toBe( 'a:0:{}' );
	} );

	it( 'should correctly serialize an array of strings', () => {
		const result = serializeForWordPress( [ 'hello', 'world' ] );
		expect( result ).toBe( 'a:2:{i:0;s:5:"hello";i:1;s:5:"world";}' );
	} );

	it( 'should correctly serialize an array of numbers', () => {
		const result = serializeForWordPress( [ 1, 2, 3 ] );
		expect( result ).toBe( 'a:3:{i:0;i:1;i:1;i:2;i:2;i:3;}' );
	} );

	it( 'should correctly serialize an array of booleans', () => {
		const result = serializeForWordPress( [ true, false ] );
		expect( result ).toBe( 'a:2:{i:0;b:1;i:1;b:0;}' );
	} );

	it( 'should correctly serialize an array with mixed types', () => {
		const result = serializeForWordPress( [ 'hello', 42, true, null ] );
		expect( result ).toBe( 'a:4:{i:0;s:5:"hello";i:1;i:42;i:2;b:1;i:3;N;}' );
	} );

	it( 'should correctly serialize an object as JSON', () => {
		const result = serializeForWordPress( { key: 'value', number: 42 } );
		expect( result ).toBe( '{"key":"value","number":42}' );
	} );

	it( 'should correctly serialize a string', () => {
		const result = serializeForWordPress( 'hello world' );
		expect( result ).toBe( 'hello world' );
	} );

	it( 'should correctly serialize a number', () => {
		const result = serializeForWordPress( 42 );
		expect( result ).toBe( '42' );
	} );

	it( 'should correctly serialize a boolean', () => {
		expect( serializeForWordPress( true ) ).toBe( '1' );
		expect( serializeForWordPress( false ) ).toBe( '0' );
	} );

	it( 'should correctly serialize null', () => {
		const result = serializeForWordPress( null );
		expect( result ).toBe( '' );
	} );

	it( 'should correctly serialize an array containing objects', () => {
		const result = serializeForWordPress( [ { name: 'test' }, { value: 123 } ] );
		expect( result ).toBe( 'a:2:{i:0;s:15:"{"name":"test"}";i:1;s:13:"{"value":123}";}' );
	} );
} );
